import { Injectable } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { mapTournamentFormat } from '../utils/tournament-presentation';

@Injectable()
export class TournamentFollowService {
  constructor(private readonly tournamentsRepository: TournamentsRepository) {}
  async followTournament(id: string, userId: string) {
    return this.tournamentsRepository.followTournament(id, userId);
  }

  async unfollowTournament(id: string, userId: string) {
    await this.tournamentsRepository.unfollowTournament(id, userId);
  }

  // Public để các service khác (matches) gọi
  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    return this.tournamentsRepository.getFollowerUserIds(tournamentId);
  }

  async getFollowedTournaments(userId: string) {
    const rows =
      await this.tournamentsRepository.getFollowedTournaments(userId);
    return rows.map((row) => mapTournamentFormat(row.tournaments));
  }
}
