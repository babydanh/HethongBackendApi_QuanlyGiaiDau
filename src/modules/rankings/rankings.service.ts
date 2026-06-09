import { Injectable } from '@nestjs/common';
import { RankingsRepository } from './rankings.repository';
import { QueryRankingDto } from './dto/query-ranking.dto';
import { UpdateEloDto } from './dto/update-elo.dto';

@Injectable()
export class RankingsService {
  constructor(private readonly rankingsRepository: RankingsRepository) {}

  async getLeaderboard(query: QueryRankingDto) {
    return this.rankingsRepository.getLeaderboard(query);
  }

  async updateMatchElo(updateEloDto: UpdateEloDto) {
    return this.rankingsRepository.processMatchEloUpdate(updateEloDto);
  }
}
