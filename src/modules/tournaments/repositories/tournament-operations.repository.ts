import { Inject, Injectable } from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, desc, eq, inArray, ne, or, sql, type SQL } from 'drizzle-orm';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentOperationsRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  async findOpsAuditLogs(
    tournamentId: string,
    divisionId?: string,
    limit: number = 50,
  ) {
    const stageRows = divisionId
      ? await this.db
          .select({ id: schema.tournamentStages.id })
          .from(schema.tournamentStages)
          .where(eq(schema.tournamentStages.tournamentDivisionId, divisionId))
      : [];

    const stageIds = stageRows.map((row) => row.id);

    const participantRows = await this.db
      .select({ id: schema.tournamentParticipants.id })
      .from(schema.tournamentParticipants)
      .where(
        divisionId
          ? and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(
                schema.tournamentParticipants.tournamentDivisionId,
                divisionId,
              ),
            )
          : eq(schema.tournamentParticipants.tournamentId, tournamentId),
      );

    const matchRows = await this.db
      .select({ id: schema.matches.id })
      .from(schema.matches)
      .where(
        divisionId
          ? stageIds.length > 0
            ? and(
                eq(schema.matches.tournamentId, tournamentId),
                inArray(schema.matches.stageId, stageIds),
              )
            : and(eq(schema.matches.tournamentId, tournamentId), sql`1 = 0`)
          : eq(schema.matches.tournamentId, tournamentId),
      );

    const participantIds = participantRows.map((row) => row.id);
    const matchIds = matchRows.map((row) => row.id);
    const auditConditions: SQL[] = [
      and(
        eq(schema.auditLogs.tableName, 'tournaments'),
        eq(schema.auditLogs.recordId, tournamentId),
      ) as SQL,
    ];

    if (participantIds.length > 0) {
      auditConditions.push(
        and(
          eq(schema.auditLogs.tableName, 'tournament_participants'),
          inArray(schema.auditLogs.recordId, participantIds),
        ) as SQL,
      );
    }

    if (matchIds.length > 0) {
      auditConditions.push(
        and(
          eq(schema.auditLogs.tableName, 'matches'),
          inArray(schema.auditLogs.recordId, matchIds),
        ) as SQL,
      );
    }

    return this.db
      .select({
        id: schema.auditLogs.id,
        userId: schema.auditLogs.userId,
        action: schema.auditLogs.action,
        tableName: schema.auditLogs.tableName,
        recordId: schema.auditLogs.recordId,
        oldValues: schema.auditLogs.oldValues,
        newValues: schema.auditLogs.newValues,
        createdAt: schema.auditLogs.createdAt,
        user: {
          email: schema.users.email,
          fullName: schema.profiles.fullName,
        },
      })
      .from(schema.auditLogs)
      .leftJoin(schema.users, eq(schema.auditLogs.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(or(...auditConditions))
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit);
  }
  async cancelTournament(tournamentId: string) {
    return await this.db.transaction(async (tx) => {
      // 1. Update tournament status to CANCELLED
      const [updatedTournament] = await tx
        .update(schema.tournaments)
        .set({ status: 'CANCELLED', updatedAt: new Date() })
        .where(eq(schema.tournaments.id, tournamentId))
        .returning();

      // 2. Fetch all active participants
      const activeParticipants = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ),
        );

      // 3. Refund each paid participant
      for (const participant of activeParticipants) {
        await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
          tx,
          tournamentId,
          participant.id,
          'TOURNAMENT_CANCELLED',
        );

        const completedPayment =
          await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
            tx,
            tournamentId,
            participant.id,
          );
        if (
          completedPayment &&
          Number(completedPayment.refundableAmount) > 0 &&
          completedPayment.refundStatus === null
        ) {
          const [profile] = await tx
            .select({
              bankName: schema.profiles.bankName,
              bankAccountNumber: schema.profiles.bankAccountNumber,
              bankAccountName: schema.profiles.bankAccountName,
            })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, completedPayment.userId))
            .limit(1);
          await this.tournamentPaymentRepository.createPendingRefund(tx, {
            paymentId: completedPayment.id,
            amount: completedPayment.refundableAmount,
            reason: 'TOURNAMENT_CANCELLED',
            requestedBy: null,
            bankName: profile?.bankName ?? undefined,
            bankAccountNumber: profile?.bankAccountNumber ?? undefined,
            bankAccountName: profile?.bankAccountName ?? undefined,
          });
        }
      }

      // 4. Cancel all active matches
      const stages = await tx
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.tournamentId, tournamentId));
      const stageIds = stages.map((s) => s.id);

      if (stageIds.length > 0) {
        const groups = await tx
          .select({ id: schema.tournamentGroups.id })
          .from(schema.tournamentGroups)
          .where(inArray(schema.tournamentGroups.stageId, stageIds));
        const groupIds = groups.map((g) => g.id);

        if (groupIds.length > 0) {
          await tx
            .update(schema.matches)
            .set({ status: 'CANCELLED', updatedAt: new Date() })
            .where(
              and(
                inArray(schema.matches.groupId, groupIds),
                ne(schema.matches.status, 'COMPLETED'),
                ne(schema.matches.status, 'CANCELLED'),
              ),
            );
        }
      }

      return updatedTournament;
    });
  }
  async getFeesConfig() {
    const getVal = async (key: string, def: string) => {
      const [existing] = await this.db
        .select()
        .from(schema.systemConfigs)
        .where(eq(schema.systemConfigs.key, key))
        .limit(1);
      return existing ? existing.value : def;
    };

    return {
      feePublicRanked: parseFloat(
        await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED', '0'),
      ),
      feePublicUnranked: parseFloat(
        await getVal('TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED', '0'),
      ),
      feeClub: parseFloat(await getVal('TOURNAMENT_PUBLISH_FEE_CLUB', '0')),
      pctPublicRanked: parseFloat(
        await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED', '5'),
      ),
      pctPublicUnranked: parseFloat(
        await getVal('PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED', '5'),
      ),
      pctClub: parseFloat(await getVal('PLATFORM_FEE_PERCENTAGE_CLUB', '0')),
      allowEntryFees:
        (await getVal('ALLOW_TOURNAMENT_ENTRY_FEES', 'true')).toLowerCase() ===
        'true',
    };
  }
}
