import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import {
  groupTournamentResultMembers,
  selectTopTournamentStandings,
} from '../utils/tournament-results';

@Injectable()
export class TournamentResultsService {
  private readonly logger = new Logger(TournamentResultsService.name);

  async getGroupStandings(tournamentId: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    return this.tournamentsRepository.findGroupStandings(
      tournamentId,
      divisionId,
    );
  }

  async getTournamentResults(tournamentId: string, divisionId?: string) {
    return this.getTournamentResultsV2(tournamentId, divisionId);
  }

  async getTournamentResultsV2(tournamentId: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const matches =
      await this.tournamentsRepository.findTournamentResultMatches(
        tournamentId,
        divisionId,
      );
    const standings = await this.tournamentsRepository.findGroupStandings(
      tournamentId,
      divisionId,
    );
    const standingRows = Array.isArray(standings)
      ? standings
      : Array.isArray(standings?.standings)
        ? standings.standings
        : [];

    const participantNameMap = new Map<string, string>();
    for (const m of matches) {
      if (m.participant1Id && m.participant1Name)
        participantNameMap.set(m.participant1Id, m.participant1Name);
      if (m.participant2Id && m.participant2Name)
        participantNameMap.set(m.participant2Id, m.participant2Name);
    }

    const participant = (id: string | null, name: string | null) => {
      if (!id) return null;
      return {
        participantId: id,
        teamName: name || participantNameMap.get(id) || 'Chưa xác định',
      };
    };

    const completed = tournament.status === 'COMPLETED';
    const allKnockoutMatches = matches.filter(
      (m) => m.stageType !== 'ROUND_ROBIN',
    );

    const knockout = allKnockoutMatches.filter(
      (match) =>
        match.winnerId &&
        (match.status === 'COMPLETED' ||
          match.status === 'FINISHED' ||
          match.status === 'DONE' ||
          (typeof match.winnerId === 'string' &&
            match.winnerId.trim().length > 0)),
    );

    const allFinalCandidates = allKnockoutMatches.filter((match) => {
      const branch = (match.bracketBranch || '').toUpperCase();
      const stageName = (match.stageName || '').toLowerCase();
      return (
        branch === 'GRAND_FINALS' ||
        branch === 'FINAL' ||
        stageName.includes('chung kết') ||
        stageName.includes('chung ket') ||
        stageName.includes('grand final')
      );
    });

    const trueFinalMatch = (
      allFinalCandidates.length > 0
        ? allFinalCandidates
        : allKnockoutMatches.filter((match) => {
            const branch = (match.bracketBranch || '').toUpperCase();
            return branch !== 'LOSERS' && branch !== 'THIRD_PLACE';
          })
    ).sort(
      (a, b) => b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder,
    )[0];

    const isFinalCompleted = Boolean(
      trueFinalMatch &&
      trueFinalMatch.winnerId &&
      (trueFinalMatch.status === 'COMPLETED' ||
        trueFinalMatch.status === 'FINISHED' ||
        trueFinalMatch.status === 'DONE' ||
        (typeof trueFinalMatch.winnerId === 'string' &&
          trueFinalMatch.winnerId.trim().length > 0)),
    );

    const final = isFinalCompleted ? trueFinalMatch : null;

    const loserOf = (match: typeof trueFinalMatch) => {
      if (!match) return null;
      const isWinnerP1 = match.winnerId === match.participant1Id;
      const loserId = isWinnerP1 ? match.participant2Id : match.participant1Id;
      const loserName = isWinnerP1
        ? match.participant2Name
        : match.participant1Name;
      return participant(loserId, loserName);
    };

    const awards: Array<{
      rank: number;
      shared: boolean;
      participant: { participantId: string; teamName: string } | null;
    }> = [];

    if (final) {
      awards.push({
        rank: 1,
        shared: false,
        participant: participant(
          final.winnerId,
          final.winnerId === final.participant1Id
            ? final.participant1Name
            : final.participant2Name,
        ),
      });
      awards.push({ rank: 2, shared: false, participant: loserOf(final) });

      const config = (tournament.tournamentConfig ?? {}) as {
        thirdPlaceMatch?: boolean;
      };

      const otherKnockout = knockout.filter((match) => match.id !== final.id);

      // 1. Matches where the two finalists won their semifinals
      const semiMatchesForFinalists = [
        otherKnockout
          .filter((match) => match.winnerId === final.participant1Id)
          .sort(
            (a, b) =>
              b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder,
          )[0],
        otherKnockout
          .filter((match) => match.winnerId === final.participant2Id)
          .sort(
            (a, b) =>
              b.roundNumber - a.roundNumber || b.matchOrder - a.matchOrder,
          )[0],
      ].filter((m): m is (typeof otherKnockout)[0] => Boolean(m));

      const semifinalLosers = semiMatchesForFinalists
        .map(loserOf)
        .filter((item): item is { participantId: string; teamName: string } =>
          Boolean(item?.participantId),
        );

      // 2. Fallback by rounds if finalists weren't matched
      if (semifinalLosers.length < 2) {
        const distinctRounds = Array.from(
          new Set(otherKnockout.map((m) => m.roundNumber)),
        ).sort((a, b) => b - a);
        const semiRound =
          distinctRounds.find((r) => r < final.roundNumber) ??
          distinctRounds[0];
        if (semiRound !== undefined) {
          const roundLosers = otherKnockout
            .filter((m) => m.roundNumber === semiRound)
            .map(loserOf)
            .filter(
              (item): item is { participantId: string; teamName: string } =>
                Boolean(item?.participantId),
            );

          for (const loser of roundLosers) {
            if (
              !semifinalLosers.some(
                (l) => l.participantId === loser.participantId,
              )
            ) {
              semifinalLosers.push(loser);
            }
          }
        }
      }

      // 3. Fallback by stageName/branch containing "bán kết" / "semi"
      if (semifinalLosers.length < 2) {
        const namedSemiLosers = otherKnockout
          .filter((m) => {
            const name = (m.stageName || '').toLowerCase();
            const branch = (m.bracketBranch || '').toLowerCase();
            return (
              name.includes('bán kết') ||
              name.includes('ban ket') ||
              name.includes('semi') ||
              branch.includes('semi')
            );
          })
          .map(loserOf)
          .filter((item): item is { participantId: string; teamName: string } =>
            Boolean(item?.participantId),
          );

        for (const loser of namedSemiLosers) {
          if (
            !semifinalLosers.some(
              (l) => l.participantId === loser.participantId,
            )
          ) {
            semifinalLosers.push(loser);
          }
        }
      }

      const thirdPlace = config.thirdPlaceMatch
        ? otherKnockout.find((match) =>
            [match.participant1Id, match.participant2Id].some((id) =>
              semifinalLosers.some((loser) => loser.participantId === id),
            ),
          )
        : undefined;

      if (thirdPlace && thirdPlace.winnerId) {
        awards.push({
          rank: 3,
          shared: false,
          participant: participant(
            thirdPlace.winnerId,
            thirdPlace.winnerId === thirdPlace.participant1Id
              ? thirdPlace.participant1Name
              : thirdPlace.participant2Name,
          ),
        });
      } else if (semifinalLosers.length > 0) {
        for (const loser of semifinalLosers) {
          if (loser?.participantId) {
            awards.push({
              rank: 3,
              shared: true,
              participant: loser,
            });
          }
        }
      }
    } else if (standingRows.length) {
      selectTopTournamentStandings(standingRows).forEach((row, index) =>
        awards.push({
          rank: index + 1,
          shared: false,
          participant: participant(row.participantId, row.teamName),
        }),
      );
    }

    const awardParticipantIds = awards
      .map((award) => award.participant?.participantId)
      .filter((id): id is string => Boolean(id));
    let membersByParticipant = new Map<
      string,
      Array<{ userId: string; fullName: string | null; avatarUrl: string | null }>
    >();

    if (awardParticipantIds.length > 0) {
      try {
        const memberRows =
          await this.tournamentsRepository.findPublicTournamentResultMembers(
            awardParticipantIds,
          );
        membersByParticipant = groupTournamentResultMembers(memberRows);
      } catch (error) {
        this.logger.warn(
          `Unable to enrich public tournament result members: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const awardsWithMembers = awards.map((award) => {
      if (!award.participant) return award;
      const members = membersByParticipant.get(award.participant.participantId);
      return members?.length
        ? { ...award, participant: { ...award.participant, members } }
        : award;
    });

    return {
      tournamentId,
      status: tournament.status,
      finalized:
        completed &&
        awardsWithMembers.length > 0 &&
        awardsWithMembers.every((award) => award.participant !== null),
      awards: awardsWithMembers,
      standings: standingRows,
      matches: matches.map((match) => ({
        id: match.id,
        status: match.status,
        roundNumber: match.roundNumber,
        matchOrder: match.matchOrder,
        bracketBranch: match.bracketBranch,
        stageId: match.stageId,
        stageName: match.stageName,
        participant1: participant(match.participant1Id, match.participant1Name),
        participant2: participant(match.participant2Id, match.participant2Name),
        winnerId: match.winnerId,
      })),
    };
  }
  constructor(private readonly tournamentsRepository: TournamentsRepository) {}
}
