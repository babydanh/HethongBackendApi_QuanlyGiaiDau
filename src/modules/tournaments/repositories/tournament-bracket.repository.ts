import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService } from '../../audit/audit.service';
import { UpdateStageDto } from '../dto/update-stage.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import {
  BracketMatch,
  BracketGroup,
  BracketStage,
} from '../interfaces/tournament-config.interface';
import {
  BracketSlotMutationOperation,
  BracketSlotName,
  UpdateBracketSlotsDto,
} from '../dto/update-bracket-slots.dto';
import {
  resolveLoserTargetSlot,
  resolveWinnerTargetSlot,
} from '../../../common/helpers/bracket-advancement.helper';

@Injectable()
export class TournamentBracketRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}
  async findBracket(
    tournamentId: string,
    divisionId?: string,
  ): Promise<{ stages: BracketStage[] }> {
    const stages = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(
        and(
          divisionId
            ? and(
                eq(schema.tournamentStages.tournamentId, tournamentId),
                eq(schema.tournamentStages.tournamentDivisionId, divisionId),
              )
            : eq(schema.tournamentStages.tournamentId, tournamentId),
          isNull(schema.tournamentStages.deletedAt),
        ),
      )
      .orderBy(schema.tournamentStages.order);

    if (stages.length === 0) return { stages: [] };

    const stageIds = stages.map((s) => s.id);

    const groups = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(inArray(schema.tournamentGroups.stageId, stageIds));

    const groupIds = groups.map((g) => g.id);

    let matchesList: BracketMatch[] = [];
    if (groupIds.length > 0) {
      const dbMatches = await this.db
        .select()
        .from(schema.matches)
        .where(
          and(
            inArray(schema.matches.groupId, groupIds),
            isNull(schema.matches.deletedAt),
          ),
        )
        .orderBy(schema.matches.roundNumber, schema.matches.matchOrder);

      const participants = await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          logoUrl: schema.tournamentParticipants.footballTeamLogoUrl,
          seed: schema.tournamentParticipants.seed,
        })
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

      const rosters = await this.db
        .select({
          participantId: schema.tournamentRosters.participantId,
          userId: schema.tournamentRosters.userId,
          fullName: schema.profiles.fullName,
        })
        .from(schema.tournamentRosters)
        .leftJoin(
          schema.profiles,
          eq(schema.tournamentRosters.userId, schema.profiles.userId),
        )
        .where(
          inArray(
            schema.tournamentRosters.participantId,
            participants.map((p) => p.id),
          ),
        );

      const rostersMap = new Map<
        string,
        { userId: string; fullName: string | null }[]
      >();
      for (const r of rosters) {
        const list = rostersMap.get(r.participantId) || [];
        list.push({ userId: r.userId, fullName: r.fullName });
        rostersMap.set(r.participantId, list);
      }

      const participantMap = new Map(
        participants.map((p) => [
          p.id,
          {
            ...p,
            members: rostersMap.get(p.id) || [],
          },
        ]),
      );

      const stageDivisionMap = new Map(
        stages.map((s) => [s.id, s.tournamentDivisionId]),
      );
      const groupStageMap = new Map(groups.map((g) => [g.id, g.stageId]));

      matchesList = dbMatches.map((m) => {
        const stageId = m.stageId || groupStageMap.get(m.groupId || '') || null;
        const divisionIdVal = stageId
          ? stageDivisionMap.get(stageId) || null
          : null;
        return {
          ...m,
          divisionId: divisionIdVal ?? null,
          participant1: m.participant1Id
            ? participantMap.get(m.participant1Id)
            : null,
          participant2: m.participant2Id
            ? participantMap.get(m.participant2Id)
            : null,
        };
      });
    }

    const groupsMap = new Map<string, BracketGroup[]>();
    for (const g of groups) {
      const groupMatches = matchesList.filter((m) => m.groupId === g.id);
      const list = groupsMap.get(g.stageId) || [];
      list.push({
        id: g.id,
        name: g.name,
        roundConfig: (g.roundConfig as Record<string, unknown>) || null,
        matches: groupMatches,
      });
      groupsMap.set(g.stageId, list);
    }

    return {
      stages: stages.map((s) => ({
        id: s.id,
        tournamentDivisionId: s.tournamentDivisionId ?? null,
        name: s.name,
        type: s.type,
        order: s.order,
        roundConfig: (s.roundConfig as Record<string, unknown>) || null,
        matchSettings: (s.matchSettings as Record<string, unknown>) || null,
        groups: groupsMap.get(s.id) || [],
      })),
    };
  }
  async updateBracketSlots(
    tournamentId: string,
    divisionId: string,
    userId: string,
    data: UpdateBracketSlotsDto,
    options: { allowLiveUnassign?: boolean } = {},
  ) {
    if (data.operations.length === 0) {
      throw new BadRequestException(
        'Cần ít nhất một thao tác cập nhật vị trí.',
      );
    }

    return this.db.transaction(async (tx) => {
      const stages = await tx
        .select({ id: schema.tournamentStages.id })
        .from(schema.tournamentStages)
        .where(
          and(
            eq(schema.tournamentStages.tournamentId, tournamentId),
            eq(schema.tournamentStages.tournamentDivisionId, divisionId),
            isNull(schema.tournamentStages.deletedAt),
          ),
        );

      if (stages.length === 0) {
        throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
      }

      const stageIds = stages.map((stage) => stage.id);
      const [tournament] = await tx
        .select({ status: schema.tournaments.status })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      if (!tournament) {
        throw new NotFoundException('Giải đấu không tồn tại');
      }
      const tournamentStatus = tournament.status.trim().toUpperCase();
      const isUnassignOnly = data.operations.every(
        (operation) =>
          String(operation.operation).trim().toUpperCase() ===
          BracketSlotMutationOperation.UNASSIGN,
      );
      const canUnassignScheduledMatchWhileTournamentRuns =
        isUnassignOnly &&
        options.allowLiveUnassign === true &&
        ['IN_PROGRESS', 'ONGOING', 'LIVE'].includes(tournamentStatus);
      if (
        ['IN_PROGRESS', 'ONGOING', 'LIVE', 'COMPLETED', 'CANCELLED'].includes(
          tournamentStatus,
        )
      ) {
        if (!canUnassignScheduledMatchWhileTournamentRuns) {
          throw new BadRequestException(
            'Không thể thay đổi participant sau khi giải đã bắt đầu hoặc kết thúc',
          );
        }
      }

      const matches = await tx
        .select()
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.tournamentId, tournamentId),
            inArray(schema.matches.stageId, stageIds),
            isNull(schema.matches.deletedAt),
          ),
        )
        .for('update');

      const matchesById = new Map(matches.map((match) => [match.id, match]));
      const originalMatches = new Map(
        matches.map((match) => [match.id, { ...match }]),
      );
      const participants = await tx
        .select({ id: schema.tournamentParticipants.id })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentParticipants.tournamentDivisionId, divisionId),
            notInArray(schema.tournamentParticipants.teamStatus, [
              'REJECTED',
              'WITHDRAWN',
              'KICKED',
            ]),
          ),
        );
      const participantIds = new Set(
        participants.map((participant) => participant.id),
      );
      const changedMatchIds = new Set<string>();

      const getMatch = (matchId: string | undefined) => {
        if (!matchId) {
          throw new BadRequestException(
            'Thiếu mã trận đấu trong thao tác bracket.',
          );
        }
        const match = matchesById.get(matchId);
        if (!match) {
          throw new NotFoundException('Trận đấu không thuộc bảng đấu này');
        }
        return match;
      };

      const assertEditable = (match: (typeof matches)[number]) => {
        const status = match.status.trim().toUpperCase();
        if (
          !['SCHEDULED', 'PENDING', 'NOT_STARTED', 'UPCOMING'].includes(status)
        ) {
          throw new BadRequestException(
            'Chỉ có thể huỷ ghép ở trận chưa thi đấu',
          );
        }
      };

      const getSlotValue = (
        match: (typeof matches)[number],
        slot: BracketSlotName | undefined,
      ) => {
        if (!slot) {
          throw new BadRequestException(
            'Thiếu vị trí participant trong thao tác bracket.',
          );
        }
        return slot === BracketSlotName.PARTICIPANT1
          ? match.participant1Id
          : match.participant2Id;
      };

      const setSlotValue = (
        match: (typeof matches)[number],
        slot: BracketSlotName | undefined,
        participantId: string | null,
      ) => {
        if (!slot) {
          throw new BadRequestException(
            'Thiếu vị trí participant trong thao tác bracket.',
          );
        }
        if (slot === BracketSlotName.PARTICIPANT1) {
          match.participant1Id = participantId;
        } else {
          match.participant2Id = participantId;
        }
        changedMatchIds.add(match.id);
      };

      const assertParticipant = (participantId: string | undefined) => {
        if (!participantId || !participantIds.has(participantId)) {
          throw new BadRequestException('Participant không thuộc bảng đấu này');
        }
      };

      const findParticipantLocation = (participantId: string) => {
        for (const match of matchesById.values()) {
          if (match.participant1Id === participantId) {
            return { match, slot: BracketSlotName.PARTICIPANT1 };
          }
          if (match.participant2Id === participantId) {
            return { match, slot: BracketSlotName.PARTICIPANT2 };
          }
        }
        return null;
      };

      for (const operation of data.operations) {
        switch (operation.operation) {
          case BracketSlotMutationOperation.ASSIGN: {
            const target = getMatch(operation.matchId);
            assertEditable(target);
            assertParticipant(operation.participantId);
            if (getSlotValue(target, operation.slot) !== null) {
              throw new BadRequestException('Vị trí bracket đã có participant');
            }
            const existingLocation = findParticipantLocation(
              operation.participantId as string,
            );
            if (existingLocation) {
              throw new BadRequestException(
                'Participant đã được xếp trong bracket',
              );
            }
            setSlotValue(
              target,
              operation.slot,
              operation.participantId as string,
            );
            break;
          }
          case BracketSlotMutationOperation.REPLACE: {
            const target = getMatch(operation.matchId);
            assertEditable(target);
            assertParticipant(operation.participantId);
            const existingLocation = findParticipantLocation(
              operation.participantId as string,
            );
            if (
              existingLocation &&
              (existingLocation.match.id !== target.id ||
                existingLocation.slot !== operation.slot)
            ) {
              throw new BadRequestException(
                'Participant đã được xếp ở vị trí khác',
              );
            }
            setSlotValue(
              target,
              operation.slot,
              operation.participantId as string,
            );
            break;
          }
          case BracketSlotMutationOperation.UNASSIGN: {
            const target = getMatch(operation.matchId);
            assertEditable(target);
            setSlotValue(target, operation.slot, null);
            break;
          }
          case BracketSlotMutationOperation.MOVE: {
            const source = getMatch(operation.fromMatchId);
            const target = getMatch(operation.toMatchId);
            assertEditable(source);
            assertEditable(target);
            if (
              source.id === target.id &&
              operation.fromSlot === operation.toSlot
            )
              break;
            const sourceParticipant = getSlotValue(source, operation.fromSlot);
            if (!sourceParticipant) {
              throw new BadRequestException(
                'Vị trí nguồn không có participant',
              );
            }
            if (getSlotValue(target, operation.toSlot) !== null) {
              throw new BadRequestException('Vị trí đích đã có participant');
            }
            setSlotValue(source, operation.fromSlot, null);
            setSlotValue(target, operation.toSlot, sourceParticipant);
            break;
          }
          case BracketSlotMutationOperation.SWAP: {
            const source = getMatch(operation.fromMatchId);
            const target = getMatch(operation.toMatchId);
            assertEditable(source);
            assertEditable(target);
            if (
              source.id === target.id &&
              operation.fromSlot === operation.toSlot
            )
              break;
            const sourceParticipant = getSlotValue(source, operation.fromSlot);
            const targetParticipant = getSlotValue(target, operation.toSlot);
            if (!sourceParticipant || !targetParticipant) {
              throw new BadRequestException(
                'Cần hai participant để hoán đổi vị trí',
              );
            }
            setSlotValue(source, operation.fromSlot, targetParticipant);
            setSlotValue(target, operation.toSlot, sourceParticipant);
            break;
          }
          default:
            throw new BadRequestException('Thao tác bracket không hợp lệ');
        }
      }

      const updatedMatches: typeof matches = [];
      for (const matchId of changedMatchIds) {
        const match = matchesById.get(matchId);
        const oldMatch = originalMatches.get(matchId);
        if (!match || !oldMatch) continue;
        const winnerStillPresent =
          !match.winnerId ||
          match.winnerId === match.participant1Id ||
          match.winnerId === match.participant2Id;
        const [updated] = await tx
          .update(schema.matches)
          .set({
            participant1Id: match.participant1Id,
            participant2Id: match.participant2Id,
            ...(winnerStillPresent ? {} : { winnerId: null }),
            revision: match.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(schema.matches.id, match.id))
          .returning();
        await this.auditService.logUpdate(
          tx,
          userId,
          'matches',
          match.id,
          oldMatch,
          updated,
        );
        updatedMatches.push(updated);
      }

      return {
        success: true,
        updatedMatchIds: updatedMatches.map((match) => match.id),
        matches: updatedMatches,
      };
    });
  }
  async findStageById(id: string) {
    const result = await this.db
      .select()
      .from(schema.tournamentStages)
      .where(eq(schema.tournamentStages.id, id))
      .limit(1);
    return result[0] || null;
  }
  async updateStage(id: string, userId: string, data: UpdateStageDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournamentStages)
        .where(eq(schema.tournamentStages.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentStages)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.type && { type: data.type }),
          ...(data.order !== undefined && { order: data.order }),
          ...(data.roundConfig !== undefined && {
            roundConfig: data.roundConfig,
          }),
          ...(data.venueId !== undefined && { venueId: data.venueId || null }),
          ...(data.scheduledDate !== undefined && {
            scheduledDate: data.scheduledDate || null,
          }),
          ...(data.notificationNote !== undefined && {
            notificationNote: data.notificationNote || null,
          }),
          ...(data.matchSettings !== undefined && {
            matchSettings: data.matchSettings || null,
          }),
        })
        .where(eq(schema.tournamentStages.id, id))
        .returning();

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_stages',
        id,
        oldRecord,
        updated,
      );
      return updated;
    });
  }
  async findGroupById(id: string) {
    const result = await this.db
      .select({
        id: schema.tournamentGroups.id,
        stageId: schema.tournamentGroups.stageId,
        name: schema.tournamentGroups.name,
        roundConfig: schema.tournamentGroups.roundConfig,
        tournamentId: schema.tournamentStages.tournamentId,
      })
      .from(schema.tournamentGroups)
      .innerJoin(
        schema.tournamentStages,
        eq(schema.tournamentGroups.stageId, schema.tournamentStages.id),
      )
      .where(eq(schema.tournamentGroups.id, id))
      .limit(1);
    return result[0] || null;
  }
  async updateGroup(id: string, userId: string, data: UpdateGroupDto) {
    return await this.db.transaction(async (tx) => {
      const [oldRecord] = await tx
        .select()
        .from(schema.tournamentGroups)
        .where(eq(schema.tournamentGroups.id, id))
        .limit(1);

      if (!oldRecord) return null;

      const [updated] = await tx
        .update(schema.tournamentGroups)
        .set({
          ...(data.name && { name: data.name }),
          ...(data.roundConfig !== undefined && {
            roundConfig: data.roundConfig,
          }),
        })
        .where(eq(schema.tournamentGroups.id, id))
        .returning();

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_groups',
        id,
        oldRecord,
        updated,
      );
      return updated;
    });
  }
  async findParticipantsForSeeding(tournamentId: string, divisionId?: string) {
    const participants = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          divisionId
            ? eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)
            : undefined,
          or(
            eq(schema.tournamentParticipants.isMock, true),
            and(
              eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
              eq(schema.tournamentParticipants.isPaid, true),
            ),
          ),
        ),
      );

    const participantIds = participants.map((p) => p.id);
    const rosters = await this.db
      .select()
      .from(schema.tournamentRosters)
      .where(inArray(schema.tournamentRosters.participantId, participantIds));

    const rosterMap = new Map<string, typeof rosters>();
    for (const r of rosters) {
      const list = rosterMap.get(r.participantId) || [];
      list.push(r);
      rosterMap.set(r.participantId, list);
    }

    return participants.map((p) => ({
      ...p,
      members: rosterMap.get(p.id) || [],
    }));
  }
  async updateSeeds(
    tournamentId: string,
    seeds: { participantId: string; seed: number }[],
  ) {
    return await this.db.transaction(async (tx) => {
      for (const item of seeds) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ seed: item.seed })
          .where(
            and(
              eq(schema.tournamentParticipants.id, item.participantId),
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
            ),
          );
      }
      return { success: true };
    });
  }
  async cancelScheduledMatchesInStage(stageId: string) {
    const result = await this.db
      .update(schema.matches)
      .set({ status: 'CANCELLED', updatedAt: new Date() })
      .where(
        and(
          eq(schema.matches.stageId, stageId),
          ne(schema.matches.status, 'COMPLETED'),
        ),
      );
    return result;
  }
  async getGroupByStageId(stageId: string) {
    const [group] = await this.db
      .select()
      .from(schema.tournamentGroups)
      .where(eq(schema.tournamentGroups.stageId, stageId))
      .limit(1);
    return group || null;
  }
  async createPlayoffMatch(data: {
    tournamentId: string;
    stageId: string;
    groupId: string;
    participant1Id: string;
    participant2Id: string;
    roundNumber: number;
    matchOrder: number;
  }) {
    const { randomUUID } = await import('crypto');
    const [match] = await this.db
      .insert(schema.matches)
      .values({
        id: randomUUID(),
        tournamentId: data.tournamentId,
        stageId: data.stageId,
        groupId: data.groupId,
        participant1Id: data.participant1Id,
        participant2Id: data.participant2Id,
        roundNumber: data.roundNumber,
        matchOrder: data.matchOrder,
        bracketBranch: 'PLAYOFF',
        status: 'SCHEDULED',
        isBye: false,
        p1SetsWon: 0,
        p2SetsWon: 0,
        totalSetsPlayed: 0,
        nextMatchId: null,
        loserNextMatchId: null,
        winnerId: null,
        updatedAt: new Date(),
      })
      .returning();
    return match;
  }
  async getMaxRoundAndMatchOrder(stageId: string) {
    const result = await this.db
      .select({
        maxRound: sql<number>`COALESCE(MAX(${schema.matches.roundNumber}), 0)`,
        maxOrder: sql<number>`COALESCE(MAX(${schema.matches.matchOrder}), 0)`,
      })
      .from(schema.matches)
      .where(eq(schema.matches.stageId, stageId));
    return result[0] || { maxRound: 0, maxOrder: 0 };
  }
}
