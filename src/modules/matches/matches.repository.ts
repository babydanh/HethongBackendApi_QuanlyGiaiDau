import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { eq, and, or, count, SQL, inArray, notInArray, isNull, sql, gte, lte, ne, lt, desc } from 'drizzle-orm';
import { QueryMatchDto } from './dto/query-match.dto';
import { CursorPaginationHelper } from '../../common/helpers/cursor-pagination.helper';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { AuditService } from '../audit/audit.service';
import {
  resolveLoserTargetSlot,
  resolveWinnerTargetSlot,
} from '../../common/helpers/bracket-advancement.helper';

/**
 * Tổng điểm ghi được của mỗi bên từ scoreDetails (sum team1Score / team2Score
 * qua từng set). Dùng để lưu group_standings.points_for/points_against = TỔNG
 * ĐIỂM (chuẩn hiệu số điểm pickleball rally), khớp cách web tính và
 * rankings.service.extractScoreRatio — KHÔNG phải số set thắng.
 */
function sumSetPoints(
  scoreDetails: Record<string, unknown> | null | undefined,
): { p1: number; p2: number } {
  const football = scoreDetails?.football;
  if (football && typeof football === 'object' && !Array.isArray(football)) {
    const value = football as Record<string, unknown>;
    const p1 = Number(value.team1Goals);
    const p2 = Number(value.team2Goals);
    if (Number.isFinite(p1) && Number.isFinite(p2)) return { p1, p2 };
  }
  let p1 = 0;
  let p2 = 0;
  if (scoreDetails?.sets && Array.isArray(scoreDetails.sets)) {
    for (const set of scoreDetails.sets as Array<Record<string, unknown>>) {
      p1 += Number(set.team1Score) || 0;
      p2 += Number(set.team2Score) || 0;
    }
  }
  return { p1, p2 };
}

@Injectable()
export class MatchesRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryMatchDto) {
    const { page = 1, limit = 10, cursor, groupId, status, userId, bracketType, genderRestriction, city, isRanked, matchType } = query;
    const publicOnly = query.publicOnly ?? query.isPublicOnly;
    const catId = query.categoryId || query.category_id;
    const take = limit + 1; // Fetch 1 extra to determine hasMore
    const tId = query.tournamentId || query.tournament_id;
    const divisionId = query.divisionId || query.division_id;

    const conditions: SQL[] = [];
    
    // Enforce soft delete filters
    conditions.push(isNull(schema.matches.deletedAt));

    const isAllCategory = (val: string) => {
      const normalized = val.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[-_]+/g, ' ');
      return (
        normalized === '' ||
        normalized === 'all' ||
        normalized === 'undefined' ||
        normalized === 'null' ||
        normalized === 'tat ca' ||
        normalized === '0'
      );
    };

    if (catId && !isAllCategory(catId)) {
      conditions.push(
        sql`exists (
          select 1 from ${schema.tournaments} t
          left join ${schema.categories} c on t.category_id = c.id
          where (t.id = ${schema.matches.tournamentId} or t.id = (
            select s.tournament_id from ${schema.tournamentGroups} g
            join ${schema.tournamentStages} s on g.stage_id = s.id
            where g.id = ${schema.matches.groupId}
          ))
          and (
            t.category_id::text = ${catId}
            or c.id::text = ${catId}
            or c.slug = ${catId}
            or c.slug = replace(${catId}, '_', '-')
            or lower(c.name) = lower(${catId})
          )
        )`
      );
    }

    if (publicOnly) {
      conditions.push(
        sql`(
          exists (
            select 1 from ${schema.tournaments} t
            where t.id = ${schema.matches.tournamentId}
            and t.deleted_at is null
            and (t.visibility = 'PUBLIC' or t.visibility is null)
            and t.status not in ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')
          )
          or exists (
            select 1 from ${schema.tournamentGroups} g
            join ${schema.tournamentStages} s on g.stage_id = s.id
            join ${schema.tournaments} t on s.tournament_id = t.id
            where g.id = ${schema.matches.groupId}
            and t.deleted_at is null
            and (t.visibility = 'PUBLIC' or t.visibility is null)
            and t.status not in ('DRAFT', 'PENDING_APPROVAL', 'SUSPENDED', 'CANCELLED', 'PENDING_DELETE', 'pending_delete')
          )
        )`
      );
    }

    if (city) {
      conditions.push(
        sql`exists (
          select 1 from ${schema.tournaments} t
          where t.id = ${schema.matches.tournamentId}
          and t."city" = ${city}
        )`
      );
    }

    if (groupId) {
      conditions.push(eq(schema.matches.groupId, groupId));
    }
    if (status) {
      const rawStatuses = status
        .split(',')
        .map((s: string) => s.trim().toUpperCase())
        .filter(Boolean);

      const expandedStatuses = new Set<string>();
      for (const s of rawStatuses) {
        expandedStatuses.add(s);
        if (s === 'COMPLETED' || s === 'FINISHED' || s === 'DONE' || s === 'ENDED') {
          expandedStatuses.add('COMPLETED');
          expandedStatuses.add('FINISHED');
          expandedStatuses.add('DONE');
          expandedStatuses.add('ENDED');
        } else if (s === 'ONGOING' || s === 'LIVE' || s === 'PLAYING') {
          expandedStatuses.add('ONGOING');
          expandedStatuses.add('LIVE');
          expandedStatuses.add('PLAYING');
        } else if (s === 'SCHEDULED' || s === 'UPCOMING' || s === 'PENDING') {
          expandedStatuses.add('SCHEDULED');
          expandedStatuses.add('UPCOMING');
          expandedStatuses.add('PENDING');
        }
      }

      const statusList = Array.from(expandedStatuses);
      if (statusList.length === 1) {
        conditions.push(sql`upper(${schema.matches.status}) = ${statusList[0]}`);
      } else if (statusList.length > 1) {
        conditions.push(inArray(sql`upper(${schema.matches.status})`, statusList));
      }
    }

    if (userId) {
      const rosters = await this.db
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.userId, userId));
      const pIds = rosters.map(r => r.participantId);
      if (pIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0, nextCursor: null, hasMore: false } };
      }
      conditions.push(
        or(
          inArray(schema.matches.participant1Id, pIds),
          inArray(schema.matches.participant2Id, pIds)
        ) as SQL
      );
    }

    let decodedCursor: { id: string; updatedAt: string } | null = null;
    if (cursor) {
      decodedCursor = CursorPaginationHelper.decodeCursor<{ id: string; updatedAt: string }>(cursor);
      if (decodedCursor) {
        conditions.push(
          or(
            lt(schema.matches.updatedAt, new Date(decodedCursor.updatedAt)),
            and(
              eq(schema.matches.updatedAt, new Date(decodedCursor.updatedAt)),
              lt(schema.matches.id, decodedCursor.id)
            )
          ) as SQL
        );
      }
    }

    // Direct filters on tournament/division
    if (tId) {
      conditions.push(eq(schema.matches.tournamentId, tId));
    }

    // Stage filters (only if specific filters like matchType, genderRestriction, bracketType, isRanked are supplied)
    const hasStageFilters = Boolean(matchType || genderRestriction || bracketType || isRanked !== undefined);
    if (hasStageFilters) {
      const stageConditions: SQL[] = [isNull(schema.tournamentStages.deletedAt)];
      if (tId) stageConditions.push(eq(schema.tournamentStages.tournamentId, tId));
      if (divisionId) stageConditions.push(eq(schema.tournamentStages.tournamentDivisionId, divisionId));

      const stagesQuery = this.db
        .select({ 
          id: schema.tournamentStages.id, 
          tournamentId: schema.tournamentStages.tournamentId,
        })
        .from(schema.tournamentStages)
        .leftJoin(schema.tournamentDivisions, eq(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id))
        .leftJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
        .where(and(
          ...stageConditions,
          ...(bracketType ? [
            sql`${schema.tournaments.tournamentConfig}->>'bracketType' = ${bracketType}`
          ] : []),
          ...(genderRestriction ? [
            or(
              eq(schema.tournamentDivisions.genderRestriction, genderRestriction),
              isNull(schema.tournamentDivisions.genderRestriction),
              and(
                or(isNull(schema.tournamentStages.tournamentDivisionId), isNull(schema.tournamentDivisions.genderRestriction)),
                or(
                  eq(schema.tournaments.genderRestriction, genderRestriction),
                  isNull(schema.tournaments.genderRestriction)
                )
              )
            )
          ] : []),
          ...(matchType ? [
            or(
              eq(schema.tournamentDivisions.matchType, matchType),
              and(
                or(isNull(schema.tournamentStages.tournamentDivisionId), isNull(schema.tournamentDivisions.matchType)),
                eq(schema.tournaments.matchType, matchType)
              )
            )
          ] : []),
          ...(isRanked !== undefined ? [eq(schema.tournaments.isRanked, isRanked)] : []),
        ));

      const stages = await stagesQuery;
      const stageIds = stages.map(s => s.id);
      const tournamentIds = Array.from(new Set(stages.map(s => s.tournamentId).filter(Boolean)));
      
      if (stageIds.length === 0 && tournamentIds.length === 0) {
        return { data: [], meta: { total: 0, page, limit, totalPages: 0, nextCursor: null, hasMore: false } };
      }

      const groups = stageIds.length > 0 ? await this.db
        .select({ id: schema.tournamentGroups.id })
        .from(schema.tournamentGroups)
        .where(inArray(schema.tournamentGroups.stageId, stageIds)) : [];
      const groupIds = groups.map(g => g.id);

      const matchScope: SQL[] = [];
      if (groupIds.length > 0) matchScope.push(inArray(schema.matches.groupId, groupIds));
      if (tournamentIds.length > 0) matchScope.push(inArray(schema.matches.tournamentId, tournamentIds));
      
      if (matchScope.length > 0) {
        conditions.push(or(...matchScope) as SQL);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRecord] = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(whereClause);

    let matchesQuery = this.db
      .select()
      .from(schema.matches)
      .where(whereClause)
      .orderBy(desc(schema.matches.updatedAt), desc(schema.matches.id))
      .limit(take)
      .$dynamic();
    const rawData = await matchesQuery;

    const hasMore = rawData.length > limit;
    const data = hasMore ? rawData.slice(0, limit) : rawData;

    const lastItem = data[data.length - 1];
    const nextCursor = (hasMore && lastItem)
      ? CursorPaginationHelper.encodeCursor({ id: lastItem.id, updatedAt: lastItem.updatedAt })
      : null;

    if (data.length === 0) {
      return {
        data: [],
        meta: {
          total: totalRecord.count,
          page,
          limit,
          totalPages: Math.ceil(totalRecord.count / limit),
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    const participantIds = new Set<string>();
    const groupIdsForMatches = new Set<string>();
    const tournamentIdsForMatches = new Set<string>();
    for (const match of data) {
      if (match.participant1Id) participantIds.add(match.participant1Id);
      if (match.participant2Id) participantIds.add(match.participant2Id);
      if (match.groupId) groupIdsForMatches.add(match.groupId);
      if (match.tournamentId) tournamentIdsForMatches.add(match.tournamentId);
    }

    const tournamentVenues = tournamentIdsForMatches.size > 0
      ? await this.db
        .select({ tournamentId: schema.tournaments.id, venueName: schema.tournamentVenues.name })
        .from(schema.tournaments)
        .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
        .where(inArray(schema.tournaments.id, Array.from(tournamentIdsForMatches)))
      : [];
    const tournamentVenueMap = new Map(tournamentVenues.map((venue) => [venue.tournamentId, venue.venueName]));

    const participantsMap = new Map<string, { id: string; teamName: string; seed: number | null; members: { userId: string; fullName: string | null }[] }>();
    if (participantIds.size > 0) {
      const participantsData = await this.db
        .select({
          id: schema.tournamentParticipants.id,
          teamName: schema.tournamentParticipants.teamName,
          seed: schema.tournamentParticipants.seed,
        })
        .from(schema.tournamentParticipants)
        .where(inArray(schema.tournamentParticipants.id, Array.from(participantIds)));

      const rosters = await this.db
        .select({
          participantId: schema.tournamentRosters.participantId,
          userId: schema.tournamentRosters.userId,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
          eloPoints: schema.userRanks.eloPoints,
        })
        .from(schema.tournamentRosters)
        .leftJoin(schema.profiles, eq(schema.tournamentRosters.userId, schema.profiles.userId))
        .leftJoin(schema.userRanks, eq(schema.tournamentRosters.userId, schema.userRanks.userId))
        .where(inArray(schema.tournamentRosters.participantId, Array.from(participantIds)));

      const rostersMap = new Map<string, { userId: string; fullName: string | null; avatarUrl: string | null; elo?: { eloPoints: number } }[]>();
      for (const r of rosters) {
        const list = rostersMap.get(r.participantId) || [];
        list.push({ 
          userId: r.userId, 
          fullName: r.fullName,
          avatarUrl: r.avatarUrl,
          elo: r.eloPoints !== null && r.eloPoints !== undefined ? { eloPoints: r.eloPoints } : undefined
        });
        rostersMap.set(r.participantId, list);
      }

      for (const p of participantsData) {
        participantsMap.set(p.id, {
          ...p,
          members: rostersMap.get(p.id) || [],
        });
      }
    }

    const groupsMap = new Map<string, { 
      id: string; 
      name: string; 
      stageName: string; 
      stageType?: string;
      stageRoundConfig?: Record<string, unknown> | null;
      groupRoundConfig?: Record<string, unknown> | null;
      tournamentName?: string; 
      categoryId?: string; 
      categoryName?: string;
      venueName?: string | null;
      matchType?: string;
      genderRestriction?: string;
    }>();
    if (groupIdsForMatches.size > 0) {
      const groupsData = await this.db
        .select({
          groupId: schema.tournamentGroups.id,
          groupName: schema.tournamentGroups.name,
          stageName: schema.tournamentStages.name,
          stageType: schema.tournamentStages.type,
          stageRoundConfig: schema.tournamentStages.roundConfig,
          groupRoundConfig: schema.tournamentGroups.roundConfig,
          tournamentName: schema.tournaments.name,
          // A division venue overrides the tournament-level venue. This is the
          // venue selected in organizer settings for the current content.
          venueName: sql<string | null>`coalesce(
            (select division_venue.name from tournament_venues division_venue
             where division_venue.id = tournament_divisions.venue_id
               and division_venue.deleted_at is null),
            ${schema.tournamentVenues.name}
          )`,
          categoryId: schema.tournaments.categoryId,
          categoryName: schema.categories.name,
          matchType: schema.tournaments.matchType,
          genderRestriction: schema.tournaments.genderRestriction,
          divisionMatchType: schema.tournamentDivisions.matchType,
          divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
        })
        .from(schema.tournamentGroups)
        .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
        .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
        .leftJoin(
          schema.tournamentDivisions,
          eq(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id),
        )
        .leftJoin(schema.categories, eq(schema.tournaments.categoryId, schema.categories.id))
        .leftJoin(schema.tournamentVenues, eq(schema.tournaments.venueId, schema.tournamentVenues.id))
        .where(inArray(schema.tournamentGroups.id, Array.from(groupIdsForMatches)));
      for (const g of groupsData) {
        groupsMap.set(g.groupId, {
          id: g.groupId,
          name: g.groupName,
          stageName: g.stageName,
          stageType: g.stageType || undefined,
          stageRoundConfig: g.stageRoundConfig as Record<string, unknown> | null,
          groupRoundConfig: g.groupRoundConfig as Record<string, unknown> | null,
          tournamentName: g.tournamentName,
          categoryId: g.categoryId || undefined,
          categoryName: g.categoryName || undefined,
          venueName: g.venueName || null,
          matchType: g.divisionMatchType || g.matchType || undefined,
          genderRestriction: g.divisionGenderRestriction || g.genderRestriction || undefined,
        });
      }
    }

    const mappedData = data.map(match => {
      const p1 = match.participant1Id ? participantsMap.get(match.participant1Id) : null;
      const p2 = match.participant2Id ? participantsMap.get(match.participant2Id) : null;
      const groupStage = match.groupId ? groupsMap.get(match.groupId) : null;

      return {
        ...match,
        cheerCount: match.cheerCount ?? 0,
        participant1: p1 ? { id: p1.id, teamName: p1.teamName, seed: p1.seed, members: p1.members } : null,
        participant2: p2 ? { id: p2.id, teamName: p2.teamName, seed: p2.seed, members: p2.members } : null,
        group: groupStage ? {
          id: groupStage.id,
          name: groupStage.name,
          roundConfig: groupStage.groupRoundConfig,
          stage: {
            name: groupStage.stageName,
            type: groupStage.stageType,
            roundConfig: groupStage.stageRoundConfig,
          }
        } : null,
        tournament: {
          name: groupStage?.tournamentName || null,
          venueName: groupStage?.venueName || tournamentVenueMap.get(match.tournamentId) || null,
          categoryId: groupStage?.categoryId,
          matchType: groupStage?.matchType,
          genderRestriction: groupStage?.genderRestriction,
          category: {
            name: groupStage?.categoryName,
          }
        },
      };
    });

    return {
      data: mappedData,
      meta: {
        total: totalRecord.count,
        page,
        limit,
        totalPages: Math.ceil(totalRecord.count / limit),
        nextCursor,
        hasMore,
      },
    };
  }

  async findById(id: string) {
    const result = await this.db
      .select()
      .from(schema.matches)
      .where(and(eq(schema.matches.id, id), isNull(schema.matches.deletedAt)))
      .limit(1);

    if (result.length === 0) return null;
    const match = result[0];

    // Fetch referee name if refereeId is set
    let refereeName: string | null = null;
    if (match.refereeId) {
      const [refereeProfile] = await this.db
        .select({ fullName: schema.profiles.fullName })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, match.refereeId))
        .limit(1);
      refereeName = refereeProfile?.fullName ?? null;
    }

    // Find the group to get stage and tournament details
    const [group] = await this.db
      .select({
        groupId: schema.tournamentGroups.id,
        name: schema.tournamentGroups.name,
        groupRoundConfig: schema.tournamentGroups.roundConfig,
        stageId: schema.tournamentStages.id,
        stageName: schema.tournamentStages.name,
        tournamentId: schema.tournaments.id,
        tournamentName: schema.tournaments.name,
        tournamentType: schema.tournaments.tournamentType,
        tournamentStatus: schema.tournaments.status,
        tournamentVisibility: schema.tournaments.visibility,
        isRanked: schema.tournaments.isRanked,
        communityId: schema.tournaments.communityId,
        categoryId: schema.tournaments.categoryId,
        matchType: schema.tournaments.matchType,
        genderRestriction: schema.tournaments.genderRestriction,
        divisionMatchType: schema.tournamentDivisions.matchType,
        divisionGenderRestriction: schema.tournamentDivisions.genderRestriction,
        createdBy: schema.tournaments.createdBy,
        stageType: schema.tournamentStages.type,
        roundConfig: schema.tournamentStages.roundConfig,
        sportRules: schema.tournaments.sportRules,
        tournamentConfig: schema.tournaments.tournamentConfig,
        categoryName: schema.categories.name,
        categorySlug: schema.categories.slug,
        categoryConfig: schema.categories.categoryConfig,
      })
      .from(schema.tournamentStages)
      .innerJoin(schema.tournaments, eq(schema.tournamentStages.tournamentId, schema.tournaments.id))
      .leftJoin(
        schema.tournamentDivisions,
        eq(schema.tournamentStages.tournamentDivisionId, schema.tournamentDivisions.id),
      )
      .leftJoin(schema.categories, eq(schema.categories.id, schema.tournaments.categoryId))
      .leftJoin(schema.tournamentGroups, eq(schema.tournamentGroups.id, match.groupId!))
      .where(
        and(
          eq(schema.tournamentStages.id, match.stageId),
          eq(schema.tournaments.id, match.tournamentId),
          isNull(schema.tournaments.deletedAt),
        ),
      )
      .limit(1);

    // A legacy row may have survived an older incomplete cascade. Do not expose
    // it when its stage/tournament is deleted or no longer matches the match.
    if (!group) return null;

    // Get details for participant 1 & 2 in a single query to reduce live-score latency.
    type ParticipantDetails = {
      id: string;
      teamName: string;
      tournamentDivisionId: string | null;
      eloPoints: number | null;
      members: { userId: string; fullName: string | null; avatarUrl: string | null; elo?: { eloPoints: number } }[];
    };
    let participant1: ParticipantDetails | null = null;
    let participant2: ParticipantDetails | null = null;

    const participantIds = [match.participant1Id, match.participant2Id].filter(
      (participantId): participantId is string => typeof participantId === 'string' && participantId.length > 0,
    );

    if (participantIds.length > 0) {
      const participants = await this.db
        .select({ 
          id: schema.tournamentParticipants.id, 
          teamName: schema.tournamentParticipants.teamName,
          tournamentDivisionId: schema.tournamentParticipants.tournamentDivisionId,
        })
        .from(schema.tournamentParticipants)
        .where(inArray(schema.tournamentParticipants.id, participantIds));

      const rosters = await this.db
        .select({
          participantId: schema.tournamentRosters.participantId,
          userId: schema.tournamentRosters.userId,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
          eloPoints: schema.userRanks.eloPoints,
        })
        .from(schema.tournamentRosters)
        .leftJoin(schema.profiles, eq(schema.tournamentRosters.userId, schema.profiles.userId))
        .leftJoin(
          schema.userRanks,
          and(
            eq(schema.tournamentRosters.userId, schema.userRanks.userId),
            eq(schema.userRanks.categoryId, group.categoryId),
          ),
        )
        .where(inArray(schema.tournamentRosters.participantId, participantIds));

      const rostersByParticipant = new Map<string, ParticipantDetails['members']>();
      for (const roster of rosters) {
        const list = rostersByParticipant.get(roster.participantId) ?? [];
        list.push({
          userId: roster.userId,
          fullName: roster.fullName,
          avatarUrl: roster.avatarUrl,
          elo: roster.eloPoints == null ? undefined : { eloPoints: roster.eloPoints },
        });
        rostersByParticipant.set(roster.participantId, list);
      }

      const matchType = group.divisionMatchType ?? group.matchType;
      const isDoubles = matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
      const userIds = rosters.map((roster) => roster.userId);
      const pairEloByKey = new Map<string, number>();
      if (isDoubles && group.categoryId && userIds.length >= 2) {
        const pairRanks = await this.db
          .select({
            user1Id: schema.pairRanks.user1Id,
            user2Id: schema.pairRanks.user2Id,
            eloPoints: schema.pairRanks.eloPoints,
            scope: schema.pairRanks.scope,
            communityId: schema.pairRanks.communityId,
          })
          .from(schema.pairRanks)
          .where(and(
            eq(schema.pairRanks.categoryId, group.categoryId),
            inArray(schema.pairRanks.matchType, ['DOUBLES', 'MIXED_DOUBLES']),
            or(
              and(inArray(schema.pairRanks.user1Id, userIds), inArray(schema.pairRanks.user2Id, userIds)),
            ),
          ));

        // Prefer the tournament's community pair rank, then the public pair rank.
        const ordered = pairRanks.sort((a, b) => {
          const score = (row: typeof a) =>
            group.communityId && row.scope === 'COMMUNITY' && row.communityId === group.communityId ? 2 :
            row.scope === 'PUBLIC' && row.communityId == null ? 1 : 0;
          return score(b) - score(a);
        });
        for (const row of ordered) {
          const key = [row.user1Id, row.user2Id].sort().join(':');
          if (!pairEloByKey.has(key)) pairEloByKey.set(key, row.eloPoints);
        }
      }

      const toParticipant = (participant: typeof participants[number]): ParticipantDetails => {
        const members = rostersByParticipant.get(participant.id) ?? [];
        const pairKey = members.length >= 2
          ? members.slice(0, 2).map((member) => member.userId).sort().join(':')
          : null;
        return {
          ...participant,
          members,
          // For doubles this is the pair rank, never a member's singles rank.
          eloPoints: isDoubles && pairKey ? pairEloByKey.get(pairKey) ?? null : members[0]?.elo?.eloPoints ?? null,
        };
      };

      participant1 = participants.find((participant) => participant.id === match.participant1Id)
        ? toParticipant(participants.find((participant) => participant.id === match.participant1Id)!)
        : null;
      participant2 = participants.find((participant) => participant.id === match.participant2Id)
        ? toParticipant(participants.find((participant) => participant.id === match.participant2Id)!)
        : null;
    }

    return {
      ...match,
      refereeName,
      groupName: group?.name || '',
      tournamentId: group?.tournamentId || '',
      tournament: group
        ? {
            id: group.tournamentId,
            name: group.tournamentName,
            tournamentType: group.tournamentType,
            status: group.tournamentStatus,
            visibility: group.tournamentVisibility,
            isRanked: group.isRanked,
            communityId: group.communityId,
            categoryId: group.categoryId,
            categoryName: group.categoryName,
            categorySlug: group.categorySlug,
            categoryConfig: group.categoryConfig,
            matchType: group.divisionMatchType ?? group.matchType,
            genderRestriction: group.divisionGenderRestriction ?? group.genderRestriction,
            createdBy: group.createdBy,
            sportRules: group.sportRules,
            tournamentConfig: group.tournamentConfig,
          }
        : null,
      stage: group ? {
        id: group.stageId,
        name: group.stageName,
        type: group.stageType,
        roundConfig: group.roundConfig,
      } : null,
      group: group?.groupId ? {
        id: group.groupId,
        name: group.name,
        roundConfig: group.groupRoundConfig,
      } : null,
      participant1,
      participant2,
    };
  }

  async findCommentsByMatchId(matchId: string, mutedUserIds: string[] = []) {
    const conditions: SQL[] = [eq(schema.matchComments.matchId, matchId)];
    if (mutedUserIds.length > 0) {
      conditions.push(notInArray(schema.matchComments.userId, mutedUserIds));
    }
    return this.db
      .select({
        id: schema.matchComments.id,
        matchId: schema.matchComments.matchId,
        commentText: schema.matchComments.commentText,
        createdAt: schema.matchComments.createdAt,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.matchComments)
      .leftJoin(schema.users, eq(schema.matchComments.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(and(...conditions))
      .orderBy(sql`${schema.matchComments.createdAt} desc`);
  }

  async createComment(matchId: string, userId: string, commentText: string) {
    const [created] = await this.db
      .insert(schema.matchComments)
      .values({
        matchId,
        userId,
        commentText,
      })
      .returning();

    const [comment] = await this.db
      .select({
        id: schema.matchComments.id,
        matchId: schema.matchComments.matchId,
        commentText: schema.matchComments.commentText,
        createdAt: schema.matchComments.createdAt,
        user: {
          id: schema.users.id,
          fullName: schema.profiles.fullName,
          avatarUrl: schema.profiles.avatarUrl,
        },
      })
      .from(schema.matchComments)
      .leftJoin(schema.users, eq(schema.matchComments.userId, schema.users.id))
      .leftJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.matchComments.id, created.id))
      .limit(1);

    return comment;
  }

  async updateScore(id: string, userId: string, data: UpdateMatchScoreDto) {
    const updated = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          p1SetsWon: schema.matches.p1SetsWon,
          p2SetsWon: schema.matches.p2SetsWon,
          scoreDetails: schema.matches.scoreDetails,
          winnerId: schema.matches.winnerId,
          status: schema.matches.status,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, id))
        .limit(1);

      if (!existing) {
        throw new NotFoundException('Match not found');
      }

      const [up] = await tx
        .update(schema.matches)
        .set({
          p1SetsWon: data.p1SetsWon,
          p2SetsWon: data.p2SetsWon,
          ...(data.scoreDetails && { scoreDetails: data.scoreDetails }),
          ...(data.winnerId && { winnerId: data.winnerId }),
          scoreConfirmedBy: userId,
          scoreConfirmedAt: new Date(),
          updatedAt: new Date(),
          revision: sql`${schema.matches.revision} + 1`,
        })
        .where(
          and(
            eq(schema.matches.id, id),
            // Optimistic lock (D3): when the client supplies expectedRevision,
            // a stale write must not win — 0 rows → conflict surfaced as 409.
            ...(data.expectedRevision !== undefined
              ? [eq(schema.matches.revision, data.expectedRevision)]
              : []),
          ),
        )
        .returning();

      if (!up) {
        const [current] = await tx
          .select({
            status: schema.matches.status,
            revision: schema.matches.revision,
          })
          .from(schema.matches)
          .where(eq(schema.matches.id, id))
          .limit(1);
        return { conflict: true, currentMatch: current };
      }

      const oldValues = {
        p1SetsWon: existing.p1SetsWon,
        p2SetsWon: existing.p2SetsWon,
        scoreDetails: existing.scoreDetails,
        winnerId: existing.winnerId,
        status: existing.status,
      };
      const newValues = {
        p1SetsWon: up.p1SetsWon,
        p2SetsWon: up.p2SetsWon,
        scoreDetails: up.scoreDetails,
        winnerId: up.winnerId,
        status: up.status,
      };

      await this.auditService.logUpdate(tx, userId, 'matches', id, oldValues, newValues);
      return [up];
    });

    // Optimistic-lock conflict: stale client revision — surface for a 409.
    if (updated && typeof updated === 'object' && 'conflict' in updated) {
      return updated as never;
    }

    const rows = updated as unknown as Array<{ id: string }>;
    return await this.findById(rows[0].id);
  }

  async updateStatus(id: string, data: UpdateMatchStatusDto) {
    const setClause: Record<string, unknown> = {
      status: data.status,
      updatedAt: new Date(),
      revision: sql`${schema.matches.revision} + 1`,
    };

    if (data.status === 'ONGOING') {
      setClause.startedAt = new Date();
    } else if (data.status === 'COMPLETED') {
      setClause.completedAt = new Date();
    }

    const [updated] = await this.db
      .update(schema.matches)
      .set(setClause)
      .where(eq(schema.matches.id, id))
      .returning();

    return await this.findById(updated.id);
  }

  async completeMatch(
    id: string,
    winnerId: string | null,
    matchDetails: {
      nextMatchId?: string | null;
      loserNextMatchId?: string | null;
      matchOrder: number;
      participant1Id: string | null;
      participant2Id: string | null;
      groupId?: string | null;
      isRoundRobin: boolean;
      p1SetsWon: number;
      p2SetsWon: number;
      scoreDetails: Record<string, unknown> | null | undefined;
      auditUserId?: string | null;
      expectedRevision?: number;
    }
  ) {
    return await this.db.transaction(async (tx) => {
      const updated = await this.completeMatchInTx(tx, id, winnerId, {
        p1SetsWon: matchDetails.p1SetsWon,
        p2SetsWon: matchDetails.p2SetsWon,
        scoreDetails: matchDetails.scoreDetails,
        auditUserId: matchDetails.auditUserId,
        expectedRevision: matchDetails.expectedRevision,
      });

      // A stale-revision completion surfaces as a conflict — standings must NOT
      // run for it (the transaction did not win the completion).
      if (updated && typeof updated === 'object' && 'conflict' in updated) {
        return updated;
      }

      // 5. Update standings if Round Robin
      if (matchDetails.isRoundRobin && updated) {
        // Query custom win/draw/loss points from sportRules
        const [group] = await tx
          .select({
            tournamentId: schema.tournamentStages.tournamentId,
          })
          .from(schema.tournamentGroups)
          .innerJoin(schema.tournamentStages, eq(schema.tournamentGroups.stageId, schema.tournamentStages.id))
          .where(eq(schema.tournamentGroups.id, updated.groupId))
          .limit(1);

        let winPoints = 3;
        let drawPoints = 1;
        let lossPoints = 0;

        if (group) {
          const [tournament] = await tx
            .select({
              sportRules: schema.tournaments.sportRules,
            })
            .from(schema.tournaments)
            .where(eq(schema.tournaments.id, group.tournamentId))
            .limit(1);

          if (tournament && tournament.sportRules) {
            const rules = tournament.sportRules as Record<string, unknown>;
            const scoring = (rules.scoring as Record<string, unknown> | undefined) ?? rules;
            if (typeof scoring.winPoints === 'number') winPoints = scoring.winPoints;
            if (typeof scoring.drawPoints === 'number') drawPoints = scoring.drawPoints;
            if (typeof scoring.lossPoints === 'number') lossPoints = scoring.lossPoints;
          }
        }

        const p1Id = updated.participant1Id;
        const p2Id = updated.participant2Id;
        const participants = [p1Id, p2Id];
        const isDraw = !winnerId && p1Id && p2Id;

        // points_for/points_against = TỔNG điểm ghi được qua các set (chuẩn
        // hiệu số điểm), không phải số set thắng. totalPoints giữ nguyên 3/1/0.
        const { p1: team1Total, p2: team2Total } = sumSetPoints(matchDetails.scoreDetails);

        for (const pId of participants) {
          if (!pId) continue;
          const isWinner = pId === winnerId;
          const pointsEarned = isDraw ? drawPoints : (isWinner ? winPoints : lossPoints);
          const pointsFor = pId === p1Id ? team1Total : team2Total;
          const pointsAgainst = pId === p1Id ? team2Total : team1Total;

          // Atomic upsert (NOTE-2): INSERT ... ON CONFLICT DO UPDATE with
          // SQL-side increments. Replaces read-modify-write, so concurrent
          // completions for the same group/participant never lose an update.
          await tx
            .insert(schema.groupStandings)
            .values({
              groupId: updated.groupId,
              participantId: pId,
              played: 1,
              won: isWinner ? 1 : 0,
              lost: (!isWinner && !isDraw) ? 1 : 0,
              draws: isDraw ? 1 : 0,
              pointsFor: pointsFor,
              pointsAgainst: pointsAgainst,
              totalPoints: pointsEarned,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: [schema.groupStandings.groupId, schema.groupStandings.participantId],
              set: {
                played: sql`${schema.groupStandings.played} + 1`,
                won: sql`${schema.groupStandings.won} + ${isWinner ? 1 : 0}`,
                lost: sql`${schema.groupStandings.lost} + ${(!isWinner && !isDraw) ? 1 : 0}`,
                draws: sql`${schema.groupStandings.draws} + ${isDraw ? 1 : 0}`,
                pointsFor: sql`${schema.groupStandings.pointsFor} + ${pointsFor}`,
                pointsAgainst: sql`${schema.groupStandings.pointsAgainst} + ${pointsAgainst}`,
                totalPoints: sql`${schema.groupStandings.totalPoints} + ${pointsEarned}`,
                updatedAt: new Date(),
              },
            });
        }
      }

      return updated;
    });
  }

  private async completeMatchInTx(
    tx: any,
    id: string,
    winnerId: string | null,
    details: {
      p1SetsWon: number;
      p2SetsWon: number;
      scoreDetails: Record<string, unknown> | null | undefined;
      auditUserId?: string | null;
      isBye?: boolean;
      expectedRevision?: number;
    }
  ) {
    const [existing] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, id))
      .limit(1);

    if (!existing) return null;

    // 1. Conditional update: only the FIRST transaction that flips
    // status away from COMPLETED may run side effects (NOTE-1).
    // Optional optimistic lock: when the caller supplies expectedRevision
    // (from a client-visible match), the update only wins if revision matches.
    const [updated] = await tx
      .update(schema.matches)
      .set({
        status: 'COMPLETED',
        winnerId,
        p1SetsWon: details.p1SetsWon,
        p2SetsWon: details.p2SetsWon,
        scoreDetails: details.scoreDetails,
        isBye: details.isBye ?? existing.isBye,
        completedAt: new Date(),
        updatedAt: new Date(),
        revision: sql`${schema.matches.revision} + 1`,
      })
      .where(
        and(
          eq(schema.matches.id, id),
          ne(schema.matches.status, 'COMPLETED'),
          ...(details.expectedRevision !== undefined
            ? [eq(schema.matches.revision, details.expectedRevision)]
            : []),
        ),
      )
      .returning();

    // Affected-row gate: no row updated means either already COMPLETED
    // (idempotent — return null, zero side effects) or a stale revision
    // conflict (client saw an older match) — surface as 409 in the service.
    if (!updated) {
      const [current] = await tx
        .select({
          status: schema.matches.status,
          revision: schema.matches.revision,
        })
        .from(schema.matches)
        .where(eq(schema.matches.id, id))
        .limit(1);
      if (!current || current.status === 'COMPLETED') return null;
      return { conflict: true, currentMatch: current } as never;
    }

    const oldValues = {
      p1SetsWon: existing.p1SetsWon,
      p2SetsWon: existing.p2SetsWon,
      scoreDetails: existing.scoreDetails,
      winnerId: existing.winnerId,
      status: existing.status,
    };
    const newValues = {
      p1SetsWon: updated.p1SetsWon,
      p2SetsWon: updated.p2SetsWon,
      scoreDetails: updated.scoreDetails,
      winnerId: updated.winnerId,
      status: updated.status,
    };
    await this.auditService.logUpdate(tx, details.auditUserId ?? null, 'matches', id, oldValues, newValues);

    // 1b. ELO transactional outbox (NOTE-3, T12): enqueue ONLY from the winning
    // transaction, and ONLY for ranked tournaments. Ranked determination is done
    // INSIDE the tx (no TOCTOU against a service-level read). UNIQUE(match_id) +
    // ON CONFLICT DO NOTHING guarantees one row per match ever.
    const [eloTournament] = await tx
      .select({ isRanked: schema.tournaments.isRanked })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, existing.tournamentId))
      .limit(1);

    const participantIds = [existing.participant1Id, existing.participant2Id].filter(
      (participantId): participantId is string => Boolean(participantId),
    );
    const consentRows = participantIds.length
      ? await tx
          .select({ rankingConsent: schema.tournamentParticipants.rankingConsent })
          .from(schema.tournamentParticipants)
          .where(inArray(schema.tournamentParticipants.id, participantIds))
      : [];
    const allParticipantsConsented =
      participantIds.length === consentRows.length &&
      consentRows.every((row) => row.rankingConsent);

    if (eloTournament?.isRanked && winnerId && allParticipantsConsented) {
      await tx
        .insert(schema.matchEloOutbox)
        .values({
          matchId: id,
          status: 'PENDING',
          attempts: 0,
          nextAttemptAt: new Date(),
        })
        .onConflictDoNothing({ target: schema.matchEloOutbox.matchId });
    }

    // 2. Two-legged knockout (bóng đá): chỉ advance khi CẢ2 leg COMPLETED.
    //    Tính aggregate = tổng bàn thắng 2 lượt; hòa tổng → luân lưu (penaltyShootout).
    let effectiveWinnerId = winnerId;
    // Use the row returned by the completion UPDATE. `existing` is a
    // pre-completion snapshot and therefore cannot establish this leg's status.
    if (updated.tieId && updated.leg) {
      const [otherLeg] = await tx
        .select()
        .from(schema.matches)
        .where(
          and(
            eq(schema.matches.tieId, updated.tieId),
            ne(schema.matches.id, updated.id),
            isNull(schema.matches.deletedAt),
          ),
        )
        .limit(1);

      const otherDone = otherLeg && otherLeg.status === 'COMPLETED';
      const thisDone = updated.status === 'COMPLETED';
      if (otherDone && thisDone && updated.nextMatchId) {
        // Aggregate: leg1 p1 vs p2, leg2 p1 vs p2 (vai home/away đã đổi ở generator)
        const leg1 = updated.leg === 1 ? updated : otherLeg!;
        const leg2 = updated.leg === 2 ? updated : otherLeg!;
        const participantIds = [leg1.participant1Id, leg1.participant2Id].filter((value): value is string => Boolean(value));
        const scoreFor = (leg: typeof leg1, participantId: string): number => {
          const football = leg.scoreDetails?.football;
          if (football && typeof football === 'object' && !Array.isArray(football)) {
            const value = football as Record<string, unknown>;
            const team1Goals = Number(value.team1Goals);
            const team2Goals = Number(value.team2Goals);
            if (Number.isFinite(team1Goals) && Number.isFinite(team2Goals)) {
              return participantId === leg.participant1Id ? team1Goals : team2Goals;
            }
          }
          return participantId === leg.participant1Id ? (leg.p1SetsWon || 0) : (leg.p2SetsWon || 0);
        };
        const totalP1 = participantIds[0] ? scoreFor(leg1, participantIds[0]) + scoreFor(leg2, participantIds[0]) : 0;
        const totalP2 = participantIds[1] ? scoreFor(leg1, participantIds[1]) + scoreFor(leg2, participantIds[1]) : 0;

        if (totalP1 > totalP2) {
          effectiveWinnerId = participantIds[0] ?? null;
        } else if (totalP2 > totalP1) {
          effectiveWinnerId = participantIds[1] ?? null;
        } else {
          // Hòa aggregate → luân lưu: lấy từ scoreDetails.shootout của leg cuối
          const updatedDetails = updated.scoreDetails as Record<string, unknown> | null;
          const shootout = (updatedDetails?.shootout ?? (updatedDetails?.football as Record<string, unknown> | undefined)?.shootout) as
            | Record<string, unknown>
            | undefined;
          const shootoutWinnerId = shootout?.winnerId as string | undefined;
          if (shootoutWinnerId) {
            effectiveWinnerId = shootoutWinnerId;
          }
          // Nếu không có luân lưu → không advance (chờ BTC xử lý)
        }
      }
    } else if (!effectiveWinnerId && updated.tieId && updated.nextMatchId) {
      // Knockout hòa + penaltyShootout: dùng shootout từ scoreDetails
      const updatedDetails = updated.scoreDetails as Record<string, unknown> | null;
      const shootout = (updatedDetails?.shootout ?? (updatedDetails?.football as Record<string, unknown> | undefined)?.shootout) as
        | Record<string, unknown>
        | undefined;
      effectiveWinnerId = (shootout?.winnerId as string | undefined) ?? null;
    }

    // 2b. Auto-advance Winner (skip khi hòa chưa phân định — winnerId null)
    if (effectiveWinnerId && existing.nextMatchId) {
      const [nextMatch] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, existing.nextMatchId))
        .limit(1);

      if (nextMatch) {
        const targetSlot = resolveWinnerTargetSlot({
          sourceBranch: existing.bracketBranch,
          sourceRoundNumber: existing.roundNumber,
          sourceMatchOrder: existing.matchOrder,
          targetBranch: nextMatch.bracketBranch,
        });
        const updateField = { [targetSlot]: effectiveWinnerId };

        await tx
          .update(schema.matches)
          .set(updateField)
          .where(eq(schema.matches.id, existing.nextMatchId));

        // Check if target match should auto-complete as a bye
        await this.autoCompleteIfByeMatch(tx, existing.nextMatchId, details.auditUserId);
      }
    }

    // 3. Auto-advance Loser (Double Elimination)
    if (existing.loserNextMatchId) {
      const [loserNextMatch] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, existing.loserNextMatchId))
        .limit(1);

      if (loserNextMatch) {
        const loserId = (winnerId === existing.participant1Id)
          ? existing.participant2Id
          : existing.participant1Id;

        const targetSlot = resolveLoserTargetSlot({
          sourceRoundNumber: existing.roundNumber,
          sourceMatchOrder: existing.matchOrder,
        });
        const updateField = { [targetSlot]: loserId };

        await tx
          .update(schema.matches)
          .set(updateField)
          .where(eq(schema.matches.id, existing.loserNextMatchId));

        // Check if target match should auto-complete as a bye
        await this.autoCompleteIfByeMatch(tx, existing.loserNextMatchId, details.auditUserId);
      }
    }

    // 4. Double Elimination — Grand Finals Reset
    if (existing.bracketBranch === 'GRAND_FINALS' && existing.roundNumber === 1) {
      if (winnerId === existing.participant2Id) {
        const [gf2Exists] = await tx
          .select()
          .from(schema.matches)
          .where(
            and(
              eq(schema.matches.groupId, existing.groupId),
              eq(schema.matches.roundNumber, 2)
            )
          )
          .limit(1);

        if (!gf2Exists) {
          const gf2Id = randomUUID();
          const [gf2] = await tx
            .insert(schema.matches)
            .values({
              id: gf2Id,
              groupId: existing.groupId,
              roundNumber: 2,
              bracketBranch: 'GRAND_FINALS',
              status: 'SCHEDULED',
              participant1Id: existing.participant1Id,
              participant2Id: existing.participant2Id,
              p1SetsWon: 0,
              p2SetsWon: 0,
              totalSetsPlayed: 0,
              tournamentId: existing.tournamentId,
              stageId: existing.stageId,
              updatedAt: new Date(),
            })
            .returning();

          await tx
            .update(schema.matches)
            .set({ nextMatchId: gf2.id })
            .where(eq(schema.matches.id, existing.id));

          updated.nextMatchId = gf2.id;
        }
      }
    }

    return updated;
  }

  private async autoCompleteIfByeMatch(tx: any, targetId: string, auditUserId?: string | null) {
    const [targetMatch] = await tx
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, targetId))
      .limit(1);

    if (!targetMatch || targetMatch.status === 'COMPLETED') return;

    // Fetch the feeding matches
    const feedingMatches = await tx
      .select()
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, targetMatch.tournamentId),
          or(
            eq(schema.matches.nextMatchId, targetId),
            eq(schema.matches.loserNextMatchId, targetId)
          )
        )
      );

    let p1Fed = false;
    let p2Fed = false;
    let p1FedCompleted = false;
    let p2FedCompleted = false;

    for (const fm of feedingMatches) {
      let targetSlot: 'p1' | 'p2' | null = null;
      if (fm.nextMatchId === targetId) {
        targetSlot = resolveWinnerTargetSlot({
          sourceBranch: fm.bracketBranch,
          sourceRoundNumber: fm.roundNumber,
          sourceMatchOrder: fm.matchOrder,
          targetBranch: targetMatch.bracketBranch,
        }) === 'participant1Id' ? 'p1' : 'p2';
      } else if (fm.loserNextMatchId === targetId) {
        targetSlot = resolveLoserTargetSlot({
          sourceRoundNumber: fm.roundNumber,
          sourceMatchOrder: fm.matchOrder,
        }) === 'participant1Id' ? 'p1' : 'p2';
      }

      if (targetSlot === 'p1') {
        p1Fed = true;
        if (fm.status === 'COMPLETED') p1FedCompleted = true;
      } else if (targetSlot === 'p2') {
        p2Fed = true;
        if (fm.status === 'COMPLETED') p2FedCompleted = true;
      }
    }

    const p1PermanentlyEmpty = !p1Fed || (p1FedCompleted && !targetMatch.participant1Id);
    const p2PermanentlyEmpty = !p2Fed || (p2FedCompleted && !targetMatch.participant2Id);

    if (targetMatch.participant1Id && p2PermanentlyEmpty) {
      await this.completeMatchInTx(tx, targetId, targetMatch.participant1Id, {
        p1SetsWon: 0,
        p2SetsWon: 0,
        scoreDetails: { isBye: true },
        isBye: true,
        auditUserId,
      });
    } else if (targetMatch.participant2Id && p1PermanentlyEmpty) {
      await this.completeMatchInTx(tx, targetId, targetMatch.participant2Id, {
        p1SetsWon: 0,
        p2SetsWon: 0,
        scoreDetails: { isBye: true },
        isBye: true,
        auditUserId,
      });
    }
  }

  async getRostersForParticipants(participantIds: string[]) {
    if (!participantIds || participantIds.length === 0) return [];
    return this.db
      .select({
        userId: schema.tournamentRosters.userId,
        participantId: schema.tournamentRosters.participantId,
      })
      .from(schema.tournamentRosters)
      .where(inArray(schema.tournamentRosters.participantId, participantIds));
  }

  async updateSchedule(
    id: string,
    userId: string | null,
    data: { courtName?: string | null; courtAddress?: string | null; refereeId?: string | null; scheduledAt?: string | null; matchConfig?: Record<string, unknown> | null },
  ) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, id))
        .limit(1);

      // Kiểm tra scheduling conflict: cùng sân, cùng giải, trong khung ±2h
      if (data.courtName && data.scheduledAt && existing) {
        const scheduledDate = new Date(data.scheduledAt);
        const conflictStart = new Date(scheduledDate.getTime() - 2 * 60 * 60 * 1000);
        const conflictEnd = new Date(scheduledDate.getTime() + 2 * 60 * 60 * 1000);

        const conflict = await tx
          .select({ id: schema.matches.id })
          .from(schema.matches)
          .where(
            and(
              eq(schema.matches.courtName, data.courtName),
              eq(schema.matches.tournamentId, existing.tournamentId),
              ne(schema.matches.id, id),
              isNull(schema.matches.deletedAt),
              gte(schema.matches.scheduledAt, conflictStart),
              lte(schema.matches.scheduledAt, conflictEnd),
            ),
          )
          .limit(1);

        if (conflict.length > 0) {
          throw new BadRequestException(
            `Sân ${data.courtName} đã có trận đấu khác trong khung giờ này (${conflictStart.toLocaleTimeString('vi-VN')} - ${conflictEnd.toLocaleTimeString('vi-VN')}).`,
          );
        }
      }

      const [updated] = await tx
        .update(schema.matches)
        .set({
          courtName: data.courtName || null,
          courtAddress: data.courtAddress || null,
          refereeId: data.refereeId || null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          ...(data.matchConfig !== undefined && { matchConfig: data.matchConfig || {} }),
          updatedAt: new Date(),
          revision: sql`${schema.matches.revision} + 1`,
        })
        .where(eq(schema.matches.id, id))
        .returning();

      if (existing && updated) {
        await this.auditService.logUpdate(tx, userId, 'matches', id, existing, updated);
      }

      return updated;
    });
  }

  async checkAllMatchesCompleted(tournamentId: string): Promise<boolean> {
    const activeMatches = await this.db
      .select({ count: count() })
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.tournamentId, tournamentId),
          sql`${schema.matches.status} != 'COMPLETED'`,
          isNull(schema.matches.deletedAt)
        )
      );
    return Number(activeMatches[0]?.count || 0) === 0;
  }

  async updateTournamentStatus(tournamentId: string, status: string) {
    await this.db
      .update(schema.tournaments)
      .set({ status: status, updatedAt: new Date() })
      .where(eq(schema.tournaments.id, tournamentId));
  }

  async isRefereeAccepted(tournamentId: string, refereeId: string): Promise<boolean> {
    const result = await this.db
      .select({ count: count() })
      .from(schema.tournamentReferees)
      .where(
        and(
          eq(schema.tournamentReferees.tournamentId, tournamentId),
          eq(schema.tournamentReferees.userId, refereeId),
          eq(schema.tournamentReferees.status, 'ACCEPTED')
        )
      );
    return Number(result[0]?.count || 0) > 0;
  }

  // ──────── Mute / Ban comment users ────────

  async getMutedUserIds(matchId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: schema.matchMutedUsers.userId })
      .from(schema.matchMutedUsers)
      .where(eq(schema.matchMutedUsers.matchId, matchId));
    return rows.map((r) => r.userId);
  }

  async getMutedUsers(matchId: string) {
    return this.db
      .select({
        id: schema.matchMutedUsers.id,
        userId: schema.matchMutedUsers.userId,
        type: schema.matchMutedUsers.type,
        reason: schema.matchMutedUsers.reason,
        expiresAt: schema.matchMutedUsers.expiresAt,
        createdAt: schema.matchMutedUsers.createdAt,
        mutedBy: schema.matchMutedUsers.mutedBy,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.matchMutedUsers)
      .leftJoin(schema.profiles, eq(schema.matchMutedUsers.userId, schema.profiles.userId))
      .where(eq(schema.matchMutedUsers.matchId, matchId));
  }

  async muteUser(
    matchId: string,
    userId: string,
    type: 'MUTE' | 'BAN',
    reason: string | null,
    mutedBy: string,
  ) {
    // Upsert: if already muted, update type/reason
    const [existing] = await this.db
      .select()
      .from(schema.matchMutedUsers)
      .where(
        and(
          eq(schema.matchMutedUsers.matchId, matchId),
          eq(schema.matchMutedUsers.userId, userId),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await this.db
        .update(schema.matchMutedUsers)
        .set({ type, reason, mutedBy })
        .where(eq(schema.matchMutedUsers.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(schema.matchMutedUsers)
      .values({ matchId, userId, type, reason, mutedBy })
      .returning();
    return created;
  }

  async unmuteUser(matchId: string, userId: string) {
    const [deleted] = await this.db
      .delete(schema.matchMutedUsers)
      .where(
        and(
          eq(schema.matchMutedUsers.matchId, matchId),
          eq(schema.matchMutedUsers.userId, userId),
        ),
      )
      .returning();
    return deleted;
  }

  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ userId: schema.tournamentFollows.userId })
      .from(schema.tournamentFollows)
      .where(eq(schema.tournamentFollows.tournamentId, tournamentId));
    return rows.map(r => r.userId);
  }

  async incrementCheerCount(id: string) {
    const [updated] = await this.db
      .update(schema.matches)
      .set({
        cheerCount: sql`${schema.matches.cheerCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.matches.id, id))
      .returning({ id: schema.matches.id, cheerCount: schema.matches.cheerCount });
    return updated ?? null;
  }

  async updateRefereeId(id: string, refereeId: string, userId: string | null) {
    return this.db.transaction(async (tx) => {
      // Use conditional UPDATE with WHERE referee_id IS NULL to prevent race (TOCTOU)
      const [updated] = await tx
        .update(schema.matches)
        .set({ refereeId, updatedAt: new Date() })
        .where(and(
          eq(schema.matches.id, id),
          isNull(schema.matches.refereeId),
        ))
        .returning();

      if (!updated) {
        // Referee already assigned by another concurrent request
        return null;
      }

      await this.auditService.logUpdate(
        tx,
        userId,
        'matches',
        id,
        { refereeId: null },
        { refereeId },
      );

      return updated;
    });
  }
}
