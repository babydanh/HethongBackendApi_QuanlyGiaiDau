import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import type { OverlayParticipantInput } from './overlay.types';

/** Cột của một trận đủ để dựng overlay; KHÔNG có cột nào chứa dữ liệu cá nhân. */
export interface OverlayMatchRow {
  id: string;
  stageId: string;
  participant1Id: string | null;
  participant2Id: string | null;
  winnerId: string | null;
  status: string;
  isBye: boolean;
  p1SetsWon: number;
  p2SetsWon: number;
  roundNumber: number;
  matchOrder: number;
  nextMatchId: string | null;
  bracketBranch: string;
}

export interface OverlayMatchContext extends OverlayMatchRow {
  h2hOverlayVisible: boolean;
  bracketOverlayVisible: boolean;
  stageType: string;
  tournamentName: string;
  tournamentMatchType: string;
  divisionMatchType: string | null;
  categoryName: string | null;
}

/** Trạng thái roster và vai trò được tính là thành viên thi đấu của một bên. */
const ACTIVE_STATUS = 'ACTIVE';
const MAIN_ROLE = 'MAIN';

const matchColumns = {
  id: schema.matches.id,
  stageId: schema.matches.stageId,
  participant1Id: schema.matches.participant1Id,
  participant2Id: schema.matches.participant2Id,
  winnerId: schema.matches.winnerId,
  status: schema.matches.status,
  isBye: schema.matches.isBye,
  p1SetsWon: schema.matches.p1SetsWon,
  p2SetsWon: schema.matches.p2SetsWon,
  roundNumber: schema.matches.roundNumber,
  matchOrder: schema.matches.matchOrder,
  nextMatchId: schema.matches.nextMatchId,
  bracketBranch: schema.matches.bracketBranch,
};

@Injectable()
export class OverlayRepository {
  constructor(@Inject(PG_CONNECTION) private readonly db: AppDb) {}

  /**
   * Trận giải đấu cùng stage, giải, hạng mục và môn. Trả null nếu trận không tồn tại, đã xoá,
   * hoặc không thuộc giải (trận CLB nằm ở bảng khác nên cũng cho kết quả null).
   */
  async findContext(matchId: string): Promise<OverlayMatchContext | null> {
    const [row] = await this.db
      .select({
        ...matchColumns,
        h2hOverlayVisible: schema.matches.h2hOverlayVisible,
        bracketOverlayVisible: schema.matches.bracketOverlayVisible,
        stageType: schema.tournamentStages.type,
        tournamentName: schema.tournaments.name,
        tournamentMatchType: schema.tournaments.matchType,
        divisionMatchType: schema.tournamentDivisions.matchType,
        categoryName: schema.categories.name,
      })
      .from(schema.matches)
      .innerJoin(
        schema.tournamentStages,
        eq(schema.matches.stageId, schema.tournamentStages.id),
      )
      .innerJoin(
        schema.tournaments,
        eq(schema.matches.tournamentId, schema.tournaments.id),
      )
      .leftJoin(
        schema.tournamentDivisions,
        eq(
          schema.tournamentStages.tournamentDivisionId,
          schema.tournamentDivisions.id,
        ),
      )
      .leftJoin(
        schema.categories,
        eq(schema.tournaments.categoryId, schema.categories.id),
      )
      .where(
        and(
          eq(schema.matches.id, matchId),
          isNull(schema.matches.deletedAt),
          isNull(schema.tournamentStages.deletedAt),
          isNull(schema.tournaments.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  /** Mọi trận nhánh chính (MAIN) của một stage, sắp theo vòng rồi thứ tự trận. */
  async findStageMainMatches(stageId: string): Promise<OverlayMatchRow[]> {
    return this.db
      .select(matchColumns)
      .from(schema.matches)
      .where(
        and(
          eq(schema.matches.stageId, stageId),
          isNull(schema.matches.deletedAt),
          sql`upper(${schema.matches.bracketBranch}) = 'MAIN'`,
        ),
      )
      .orderBy(
        asc(schema.matches.roundNumber),
        asc(schema.matches.matchOrder),
      );
  }

  /**
   * Các bên kèm thành viên thi đấu (roster ACTIVE, vai trò MAIN) theo thứ tự vào đội.
   * Cố ý KHÔNG chọn userId, email, số điện thoại hay ELO.
   */
  async findParticipants(
    participantIds: string[],
  ): Promise<Map<string, OverlayParticipantInput>> {
    const result = new Map<string, OverlayParticipantInput>();
    if (participantIds.length === 0) return result;

    const participants = await this.db
      .select({
        id: schema.tournamentParticipants.id,
        teamName: schema.tournamentParticipants.teamName,
      })
      .from(schema.tournamentParticipants)
      .where(inArray(schema.tournamentParticipants.id, participantIds));
    for (const participant of participants) {
      result.set(participant.id, { ...participant, members: [] });
    }

    const rosters = await this.db
      .select({
        participantId: schema.tournamentRosters.participantId,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentRosters)
      .leftJoin(
        schema.profiles,
        eq(schema.tournamentRosters.userId, schema.profiles.userId),
      )
      .where(
        and(
          inArray(schema.tournamentRosters.participantId, participantIds),
          eq(schema.tournamentRosters.status, ACTIVE_STATUS),
          eq(schema.tournamentRosters.role, MAIN_ROLE),
        ),
      )
      .orderBy(
        asc(schema.tournamentRosters.joinedAt),
        asc(schema.tournamentRosters.id),
      );
    for (const roster of rosters) {
      result.get(roster.participantId)?.members.push({
        fullName: roster.fullName,
        avatarUrl: roster.avatarUrl,
      });
    }
    return result;
  }
}
