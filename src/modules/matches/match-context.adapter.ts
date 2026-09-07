import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { MatchesRepository } from './matches.repository';

export type MatchContext =
  | { type: 'TOURNAMENT'; matchId: string; tournamentId: string }
  | {
      type: 'CLUB_SOCIAL_MATCH_SESSION';
      matchId: string;
      clubMatchSessionId: string;
      communityId: string;
    };

/**
 * The sole cross-context resolver. Tournament tables keep their strict
 * invariants; callers opt into the separate club-session context explicitly.
 */
@Injectable()
export class MatchContextAdapter {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly matchesRepository: MatchesRepository,
  ) {}

  async resolve(matchId: string): Promise<MatchContext | null> {
    const [tournamentMatch] = await this.db
      .select({ tournamentId: schema.matches.tournamentId })
      .from(schema.matches)
      .where(and(eq(schema.matches.id, matchId), isNull(schema.matches.deletedAt)))
      .limit(1);
    if (tournamentMatch) {
      return { type: 'TOURNAMENT', matchId, tournamentId: tournamentMatch.tournamentId };
    }
    const [clubMatch] = await this.db
      .select({
        clubMatchSessionId: schema.clubMatchSessionMatches.sessionId,
        communityId: schema.clubMatchSessions.communityId,
      })
      .from(schema.clubMatchSessionMatches)
      .innerJoin(schema.clubMatchSessions, eq(schema.clubMatchSessions.id, schema.clubMatchSessionMatches.sessionId))
      .where(and(eq(schema.clubMatchSessionMatches.id, matchId), isNull(schema.clubMatchSessionMatches.deletedAt), isNull(schema.clubMatchSessions.deletedAt)))
      .limit(1);
    return clubMatch
      ? { type: 'CLUB_SOCIAL_MATCH_SESSION', matchId, ...clubMatch }
      : null;
  }

  canAccessLiveTournament(tournamentId: string, userId?: string | null, roles: string[] = []) {
    return this.matchesRepository.canAccessLiveTournament(tournamentId, userId, roles);
  }

  async canAccessLiveMatch(matchId: string, userId?: string | null, roles: string[] = []) {
    const context = await this.resolve(matchId);
    if (!context) return false;
    if (context.type === 'TOURNAMENT') {
      return this.matchesRepository.canAccessLiveTournament(context.tournamentId, userId, roles);
    }
    return this.canAccessClubMatchSession(context.clubMatchSessionId, userId, roles);
  }

  async canAccessClubMatchSession(sessionId: string, userId?: string | null, roles: string[] = []) {
    if (roles.includes('ADMIN')) return true;
    if (!userId) return false;
    const [row] = await this.db
      .select({ id: schema.clubMatchSessions.id })
      .from(schema.clubMatchSessions)
      .innerJoin(schema.communityMembers, and(eq(schema.communityMembers.communityId, schema.clubMatchSessions.communityId), eq(schema.communityMembers.userId, userId), eq(schema.communityMembers.status, 'JOINED')))
      .where(and(eq(schema.clubMatchSessions.id, sessionId), isNull(schema.clubMatchSessions.deletedAt)))
      .limit(1);
    return Boolean(row);
  }
}
