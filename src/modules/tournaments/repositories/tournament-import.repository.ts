import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, count, eq, ne } from 'drizzle-orm';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentImportRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  async importParticipants(
    tournamentId: string,
    managerUserId: string,
    items: {
      teamName: string;
      player1Name: string;
      player1Email?: string;
      player1Phone?: string;
      player2Name?: string;
      player2Email?: string;
      player2Phone?: string;
      elo?: number;
      isPaid?: boolean;
      autoApprove?: boolean;
      customResponses?: Record<string, unknown>;
    }[],
    divisionId?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      const tournament = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1)
        .then((res) => res[0]);

      if (!tournament) throw new BadRequestException('Giải đấu không tồn tại');

      let divisionMatchType = tournament.matchType;
      if (divisionId) {
        const division = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.id, divisionId),
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
            ),
          )
          .limit(1)
          .then((res) => res[0]);

        if (!division) {
          throw new BadRequestException(
            'Nội dung thi đấu không thuộc giải này',
          );
        }
        divisionMatchType = division.matchType;
      }

      const isDoubles =
        divisionMatchType === 'DOUBLES' ||
        divisionMatchType === 'MIXED_DOUBLES';

      if (!items.length) {
        throw new BadRequestException('Danh sách nhập không có dữ liệu hợp lệ');
      }

      const [existingCount] = await tx
        .select({ count: count() })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            ...(divisionId
              ? [
                  eq(
                    schema.tournamentParticipants.tournamentDivisionId,
                    divisionId,
                  ),
                ]
              : []),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ),
        );
      const maxParticipants = divisionId
        ? await tx
            .select({
              maxParticipants: schema.tournamentDivisions.maxParticipants,
            })
            .from(schema.tournamentDivisions)
            .where(eq(schema.tournamentDivisions.id, divisionId))
            .limit(1)
            .then((rows) => rows[0]?.maxParticipants ?? null)
        : tournament.maxParticipants;
      if (
        maxParticipants != null &&
        existingCount.count + items.length > maxParticipants
      ) {
        throw new BadRequestException(
          `Số lượng nhập vượt quá giới hạn nội dung thi đấu (${maxParticipants})`,
        );
      }

      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const results: (typeof schema.tournamentParticipants.$inferSelect)[] = [];
      const unregisteredEmails: Array<{
        email: string;
        name: string;
        teamName: string;
      }> = [];
      const linkedAccountNotifications: Array<{
        userId: string;
        status: 'COMPLETE' | 'PENDING_APPROVAL';
        divisionId: string | null;
      }> = [];

      for (const [itemIndex, item] of items.entries()) {
        const player1Name = item.player1Name?.trim();
        const player2Name = item.player2Name?.trim() || '';
        const teamName = item.teamName?.trim() || player1Name;
        const p1Email = item.player1Email?.trim()?.toLowerCase();
        const p2Email = item.player2Email?.trim()?.toLowerCase();
        const p1Phone = item.player1Phone?.trim();
        const p2Phone = item.player2Phone?.trim();
        const hasPlayer2Data = Boolean(player2Name || p2Email || p2Phone);

        if (!player1Name) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} thiếu tên VĐV 1`,
          );
        }
        if (isDoubles && !player2Name) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} của nội dung đôi thiếu VĐV 2`,
          );
        }
        if (!isDoubles && hasPlayer2Data) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} của nội dung đơn có dữ liệu VĐV 2`,
          );
        }
        if (
          (p1Email && !emailPattern.test(p1Email)) ||
          (p2Email && !emailPattern.test(p2Email))
        ) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} có email không hợp lệ`,
          );
        }
        if (p1Email && p2Email && p1Email === p2Email) {
          throw new BadRequestException(
            `Dòng ${itemIndex + 1} dùng trùng email cho hai VĐV`,
          );
        }

        // Resolve only existing SportO accounts. Unmatched contacts remain
        // participant metadata and never become synthetic users or notification
        // recipients.
        let user1Id: string | null = null;
        if (p1Email || p1Phone) {
          let foundUser: typeof schema.users.$inferSelect | undefined;
          if (p1Email) {
            foundUser = await tx
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, p1Email))
              .limit(1)
              .then((r) => r[0]);
          }
          if (!foundUser && p1Phone) {
            const foundProfile = await tx
              .select()
              .from(schema.profiles)
              .where(eq(schema.profiles.phoneNumber, p1Phone))
              .limit(1)
              .then((r) => r[0]);
            if (foundProfile) {
              foundUser = await tx
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, foundProfile.userId))
                .limit(1)
                .then((r) => r[0]);
            }
          }
          user1Id = foundUser?.id ?? null;
        }

        // Resolve User 2 only when the doubles participant already has a
        // matching SportO account. Names/emails are retained in customResponses.
        let user2Id: string | null = null;
        if (isDoubles && hasPlayer2Data && (p2Email || p2Phone)) {
          let foundUser2: typeof schema.users.$inferSelect | undefined;
          if (p2Email) {
            foundUser2 = await tx
              .select()
              .from(schema.users)
              .where(eq(schema.users.email, p2Email))
              .limit(1)
              .then((r) => r[0]);
          }
          if (!foundUser2 && p2Phone) {
            const foundProfile2 = await tx
              .select()
              .from(schema.profiles)
              .where(eq(schema.profiles.phoneNumber, p2Phone))
              .limit(1)
              .then((r) => r[0]);
            if (foundProfile2) {
              foundUser2 = await tx
                .select()
                .from(schema.users)
                .where(eq(schema.users.id, foundProfile2.userId))
                .limit(1)
                .then((r) => r[0]);
            }
          }
          user2Id = foundUser2?.id ?? null;
        }

        const teamStatus =
          item.autoApprove && (item.isPaid ?? true)
            ? 'COMPLETE'
            : 'PENDING_APPROVAL';

        const [participant] = await tx
          .insert(schema.tournamentParticipants)
          .values({
            tournamentId,
            tournamentDivisionId: divisionId ?? null,
            registeredBy: user1Id || managerUserId,
            teamName: teamName || 'Đội đăng ký',
            isPaid: item.isPaid ?? true,
            entryFeeAtRegistration: (
              await this.tournamentPaymentRepository.resolveDivisionEntryFee(
                tx,
                tournament,
                divisionId,
              )
            ).toFixed(2),
            teamStatus,
            partnerUserId: user2Id || null,
            seed: item.elo ? Math.round(item.elo) : null,
            customResponses: item.customResponses || {
              importedFrom: 'GOOGLE_FORM',
              player1Email: item.player1Email,
              player1Phone: item.player1Phone,
              player2Name: player2Name || undefined,
              player2Email: p2Email,
              player2Phone: p2Phone,
            },
          })
          .returning();

        if (user1Id) {
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user1Id,
            role: 'MAIN',
          });
        }

        if (user2Id) {
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: user2Id,
            role: 'MAIN',
          });
        }

        for (const linkedUserId of new Set(
          [user1Id, user2Id].filter((value): value is string => Boolean(value)),
        )) {
          linkedAccountNotifications.push({
            userId: linkedUserId,
            status: teamStatus,
            divisionId: divisionId ?? null,
          });
        }

        results.push(participant);
      }

      return {
        importedCount: results.length,
        unregisteredEmails,
        linkedAccountNotifications,
        participants: results,
      };
    });
  }
}
