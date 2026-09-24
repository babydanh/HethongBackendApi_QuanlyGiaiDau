import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { and, count, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { AuditService } from '../../audit/audit.service';
import { CreateDivisionDto } from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentDivisionRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  /** Preserve unrelated stage settings when a partial round configuration is saved. */
  private mergeRoundConfig(
    existing: unknown,
    incoming: unknown,
  ): Record<string, unknown> {
    const previous =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? (existing as Record<string, unknown>)
        : {};
    const next =
      incoming && typeof incoming === 'object' && !Array.isArray(incoming)
        ? (incoming as Record<string, unknown>)
        : {};
    const merged: Record<string, unknown> = { ...previous, ...next };

    for (const key of [
      'groupsConfig',
      'advancementConfig',
      'playoffConfig',
      'scoring',
      'tiebreakerRules',
      'rounds',
    ]) {
      const previousValue = previous[key];
      const nextValue = next[key];
      if (
        previousValue &&
        typeof previousValue === 'object' &&
        !Array.isArray(previousValue) &&
        nextValue &&
        typeof nextValue === 'object' &&
        !Array.isArray(nextValue)
      ) {
        merged[key] = {
          ...(previousValue as Record<string, unknown>),
          ...(nextValue as Record<string, unknown>),
        };
      }
    }

    return merged;
  }
  async getDivisionsByTournament(tournamentId: string) {
    try {
      const [tournament] = await this.db
        .select({ entryFee: schema.tournaments.entryFee })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      const tournamentEntryFee = tournament?.entryFee ?? '0';

      const divisions = await this.db
        .select()
        .from(schema.tournamentDivisions)
        .where(eq(schema.tournamentDivisions.tournamentId, tournamentId))
        .orderBy(schema.tournamentDivisions.createdAt);

      return await Promise.all(
        divisions.map(async (division) => {
          const [participantCountByDivision] = await this.db
            .select({ count: count() })
            .from(schema.tournamentParticipants)
            .where(
              and(
                eq(
                  schema.tournamentParticipants.tournamentDivisionId,
                  division.id,
                ),
                ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
                ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
                ne(schema.tournamentParticipants.teamStatus, 'CANCELLED'),
              ),
            );

          return {
            ...division,
            // API consumers receive the effective fee. The nullable raw fee
            // remains available as entryFeeOverride for organizer controls.
            entryFee: division.entryFeeOverrideEnabled
              ? division.entryFee
              : tournamentEntryFee,
            entryFeeOverride: division.entryFeeOverrideEnabled
              ? division.entryFee
              : null,
            effectiveEntryFee: division.entryFeeOverrideEnabled
              ? division.entryFee
              : tournamentEntryFee,
            _count: {
              participants: participantCountByDivision.count,
            },
          };
        }),
      );
    } catch (error) {
      console.error(
        `Failed to get divisions for tournament ${tournamentId}:`,
        error,
      );
      throw error;
    }
  }
  async findDivisionById(id: string) {
    try {
      const [division] = await this.db
        .select()
        .from(schema.tournamentDivisions)
        .where(eq(schema.tournamentDivisions.id, id))
        .limit(1);

      return division ?? null;
    } catch (error) {
      console.error(`Failed to get division ${id}:`, error);
      throw error;
    }
  }
  async countDivisionParticipants(divisionId: string): Promise<number> {
    try {
      const [result] = await this.db
        .select({ value: count() })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            notInArray(schema.tournamentParticipants.teamStatus, [
              'REJECTED',
              'WITHDRAWN',
              'KICKED',
              'EXPIRED',
              'CANCELLED',
            ]),
          ),
        );
      return Number(result?.value ?? 0);
    } catch (error) {
      console.error(
        `Failed to count participants for division ${divisionId}:`,
        error,
      );
      return 0;
    }
  }
  async createDivision(
    division: CreateDivisionDto & { tournamentId: string },
    userId: string | null,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        try {
          const [created] = await tx
            .insert(schema.tournamentDivisions)
            .values({
              tournamentId: division.tournamentId,
              name: division.name,
              matchType: division.matchType,
              genderRestriction: division.genderRestriction || null,
              maxParticipants: division.maxParticipants || null,
              entryFee:
                division.entryFee != null ? division.entryFee.toString() : null,
              entryFeeOverrideEnabled:
                division.entryFeeOverrideEnabled ?? false,
              isConfigOverride: division.isConfigOverride ?? false,
              venueId: division.venueId ?? null,
              bracketType: division.bracketType ?? null,
              roundConfig: division.roundConfig ?? null,
              startDate: division.startDate
                ? new Date(division.startDate)
                : null,
              registrationEndDate: division.registrationEndDate
                ? new Date(division.registrationEndDate)
                : null,
              minElo: division.minElo ?? null,
              maxElo: division.maxElo ?? null,
              prizeDescription: division.prizeDescription ?? null,
              status: 'DRAFT',
            })
            .returning();

          await this.auditService.logCreate(
            tx,
            userId,
            'tournament_divisions',
            created.id,
            created,
          );

          return created;
        } catch (txError) {
          console.error('🔴 Transaction error details:', txError);
          throw txError;
        }
      });
    } catch (error) {
      console.error('Failed to create division:', error);
      throw error;
    }
  }
  async updateDivision(
    id: string,
    dto: UpdateDivisionDto,
    userId: string | null,
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [oldRecord] = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id))
          .limit(1);

        if (!oldRecord) {
          throw new NotFoundException('Không tìm thấy nội dung thi đấu');
        }

        const mergedRoundConfig =
          dto.roundConfig === undefined
            ? undefined
            : this.mergeRoundConfig(oldRecord.roundConfig, dto.roundConfig);

        const [tournamentRecord] = await tx
          .select({
            id: schema.tournaments.id,
            status: schema.tournaments.status,
            isRegistrationLocked: schema.tournaments.isRegistrationLocked,
            matchType: schema.tournaments.matchType,
            genderRestriction: schema.tournaments.genderRestriction,
            tournamentConfig: schema.tournaments.tournamentConfig,
          })
          .from(schema.tournaments)
          .where(eq(schema.tournaments.id, oldRecord.tournamentId))
          .for('update')
          .limit(1);

        const hasEntryFeeMutation =
          dto.entryFeeOverrideEnabled !== undefined ||
          dto.entryFee !== undefined;
        const nextEntryFeeOverrideEnabled = hasEntryFeeMutation
          ? (dto.entryFeeOverrideEnabled ??
            (dto.entryFee !== undefined &&
              dto.entryFee !== null &&
              dto.entryFee > 0))
          : undefined;
        const nextEntryFee = hasEntryFeeMutation
          ? nextEntryFeeOverrideEnabled
            ? dto.entryFee
            : null
          : undefined;

        if (hasEntryFeeMutation) {
          if (!tournamentRecord) {
            throw new NotFoundException('Giải đấu không tồn tại');
          }
          if (nextEntryFeeOverrideEnabled && nextEntryFee == null) {
            throw new BadRequestException(
              'Vui lòng nhập lệ phí riêng hoặc tắt tùy chọn lệ phí riêng.',
            );
          }

          await this.tournamentPaymentRepository.assertEntryFeeChangeAllowed(
            tx,
            tournamentRecord,
            oldRecord.entryFee,
            nextEntryFee,
            oldRecord.entryFeeOverrideEnabled,
            nextEntryFeeOverrideEnabled,
          );
        }

        const [divisionCount] = await tx
          .select({ value: count() })
          .from(schema.tournamentDivisions)
          .where(
            eq(schema.tournamentDivisions.tournamentId, oldRecord.tournamentId),
          );

        const tournamentConfig = tournamentRecord?.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined;
        const isLiteTournament =
          tournamentConfig?.mode === 'LITE' &&
          tournamentConfig?.hideAdvancedSettings === true;

        const [updated] = await tx
          .update(schema.tournamentDivisions)
          .set({
            ...(dto.name && { name: dto.name }),
            ...(dto.matchType && { matchType: dto.matchType }),
            ...(dto.genderRestriction !== undefined && {
              genderRestriction: dto.genderRestriction,
            }),
            ...(dto.maxParticipants !== undefined && {
              maxParticipants: dto.maxParticipants,
            }),
            ...(hasEntryFeeMutation && {
              entryFee: nextEntryFee != null ? nextEntryFee.toString() : null,
              entryFeeOverrideEnabled: nextEntryFeeOverrideEnabled,
            }),
            ...(dto.status && { status: dto.status }),
            ...(dto.isConfigOverride !== undefined && {
              isConfigOverride: dto.isConfigOverride,
            }),
            ...(dto.venueId !== undefined && { venueId: dto.venueId }),
            ...(dto.bracketType !== undefined && {
              bracketType: dto.bracketType,
            }),
            ...(mergedRoundConfig !== undefined && {
              roundConfig: mergedRoundConfig,
            }),
            ...(dto.startDate !== undefined && {
              startDate: dto.startDate ? new Date(dto.startDate) : null,
            }),
            ...(dto.registrationEndDate !== undefined && {
              registrationEndDate: dto.registrationEndDate
                ? new Date(dto.registrationEndDate)
                : null,
            }),
            ...(dto.minElo !== undefined && { minElo: dto.minElo }),
            ...(dto.maxElo !== undefined && { maxElo: dto.maxElo }),
            ...(dto.prizeDescription !== undefined && {
              prizeDescription: dto.prizeDescription,
            }),
          })
          .where(eq(schema.tournamentDivisions.id, id))
          .returning();

        if (
          updated &&
          isLiteTournament &&
          divisionCount.value === 1 &&
          (updated.matchType !== oldRecord.matchType ||
            updated.genderRestriction !== oldRecord.genderRestriction)
        ) {
          const [updatedTournament] = await tx
            .update(schema.tournaments)
            .set({
              matchType: updated.matchType,
              genderRestriction: updated.genderRestriction,
              updatedAt: new Date(),
            })
            .where(eq(schema.tournaments.id, oldRecord.tournamentId))
            .returning();

          await this.auditService.logUpdate(
            tx,
            userId,
            'tournaments',
            oldRecord.tournamentId,
            tournamentRecord,
            updatedTournament,
          );
        }

        await this.auditService.logUpdate(
          tx,
          userId,
          'tournament_divisions',
          id,
          oldRecord,
          updated,
        );

        return updated;
      });
    } catch (error) {
      console.error(`Failed to update division ${id}:`, error);
      throw error;
    }
  }
  async deleteDivision(id: string, userId: string | null) {
    try {
      return await this.db.transaction(async (tx) => {
        const [oldRecord] = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id))
          .limit(1);

        if (!oldRecord) {
          throw new NotFoundException('Không tìm thấy nội dung thi đấu');
        }

        const [{ value: remainingDivisions }] = await tx
          .select({ value: count() })
          .from(schema.tournamentDivisions)
          .where(
            eq(schema.tournamentDivisions.tournamentId, oldRecord.tournamentId),
          );

        if (remainingDivisions <= 1) {
          throw new BadRequestException(
            'Phải có ít nhất 1 hình thức thi đấu. Hãy xóa cả giải đấu nếu không cần.',
          );
        }

        const [{ value: activeParticipants }] = await tx
          .select({ value: count() })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentDivisionId, id),
              eq(schema.tournamentParticipants.isMock, false),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ),
          );

        if (activeParticipants > 0) {
          throw new BadRequestException(
            'Không thể xóa hình thức đang có người chơi thật. Hãy di chuyển hoặc loại bỏ người chơi thật trước.',
          );
        }

        const mockParticipants = await tx
          .select({ id: schema.tournamentParticipants.id })
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentDivisionId, id),
              eq(schema.tournamentParticipants.isMock, true),
            ),
          );
        const mockParticipantIds = mockParticipants.map(
          (participant) => participant.id,
        );
        const mockRosterUsers =
          mockParticipantIds.length > 0
            ? await tx
                .select({ userId: schema.tournamentRosters.userId })
                .from(schema.tournamentRosters)
                .where(
                  inArray(
                    schema.tournamentRosters.participantId,
                    mockParticipantIds,
                  ),
                )
            : [];

        // Hard delete since tournament_divisions doesn't have a deletedAt column
        // and cascade is handled by FK constraint
        await tx
          .delete(schema.tournamentDivisions)
          .where(eq(schema.tournamentDivisions.id, id));

        const mockUserIds = Array.from(
          new Set(mockRosterUsers.map((roster) => roster.userId)),
        );
        if (mockUserIds.length > 0) {
          const remainingRosterUsers = await tx
            .select({ userId: schema.tournamentRosters.userId })
            .from(schema.tournamentRosters)
            .where(inArray(schema.tournamentRosters.userId, mockUserIds));
          const remainingRegistrants = await tx
            .select({ userId: schema.tournamentParticipants.registeredBy })
            .from(schema.tournamentParticipants)
            .where(
              inArray(schema.tournamentParticipants.registeredBy, mockUserIds),
            );
          const referencedUserIds = new Set([
            ...remainingRosterUsers.map((row) => row.userId),
            ...remainingRegistrants.map((row) => row.userId),
          ]);
          const orphanMockUserIds = mockUserIds.filter(
            (mockUserId) => !referencedUserIds.has(mockUserId),
          );

          if (orphanMockUserIds.length > 0) {
            await tx
              .delete(schema.profiles)
              .where(inArray(schema.profiles.userId, orphanMockUserIds));
            await tx
              .delete(schema.users)
              .where(
                and(
                  inArray(schema.users.id, orphanMockUserIds),
                  eq(schema.users.isMock, true),
                ),
              );
          }
        }

        await this.auditService.logDelete(
          tx,
          userId,
          'tournament_divisions',
          id,
          oldRecord,
        );

        return {
          success: true,
          removedMockParticipants: mockParticipantIds.length,
        };
      });
    } catch (error) {
      console.error(`Failed to delete division ${id}:`, error);
      throw error;
    }
  }
  async updateDivisionConfig(
    id: string,
    dto: UpdateDivisionDto,
    userId: string | null,
  ) {
    return this.updateDivision(
      id,
      { ...dto, isConfigOverride: dto.isConfigOverride ?? true },
      userId,
    );
  }
  async getParticipantsByDivision(divisionId: string) {
    try {
      return await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          seed: schema.tournamentParticipants.seed,
          isPaid: schema.tournamentParticipants.isPaid,
          registeredAt: schema.tournamentParticipants.registeredAt,
          registeredBy: {
            id: schema.users.id,
            fullName: schema.profiles.fullName,
            avatarUrl: schema.profiles.avatarUrl,
          },
        })
        .from(schema.tournamentParticipants)
        .leftJoin(
          schema.users,
          eq(schema.tournamentParticipants.registeredBy, schema.users.id),
        )
        .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ),
        );
    } catch (error) {
      console.error(
        `Failed to get participants for division ${divisionId}:`,
        error,
      );
      throw error;
    }
  }
}
