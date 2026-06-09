import { Injectable, NotFoundException } from '@nestjs/common';
import { MatchesRepository } from './matches.repository';
import { QueryMatchDto } from './dto/query-match.dto';
import { UpdateMatchScoreDto } from './dto/update-match-score.dto';
import { UpdateMatchStatusDto } from './dto/update-match-status.dto';
import { LiveScoreGateway } from './live-score.gateway';

@Injectable()
export class MatchesService {
  constructor(
    private readonly matchesRepository: MatchesRepository,
    private readonly liveScoreGateway: LiveScoreGateway,
  ) {}

  async findAll(query: QueryMatchDto) {
    return this.matchesRepository.findAll(query);
  }

  async findOne(id: string) {
    const match = await this.matchesRepository.findById(id);
    if (!match) {
      throw new NotFoundException('Match not found');
    }
    return match;
  }

  async updateScore(
    id: string,
    userId: string,
    updateMatchScoreDto: UpdateMatchScoreDto,
  ) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    // Todo: Implement pessimistic locking and ELO calculation if the match is COMPLETED
    const updatedMatch = await this.matchesRepository.updateScore(
      id,
      userId,
      updateMatchScoreDto,
    );

    // Broadcast score real-time
    this.liveScoreGateway.broadcastScoreUpdate(id, updatedMatch);

    return updatedMatch;
  }

  async updateStatus(id: string, updateMatchStatusDto: UpdateMatchStatusDto) {
    const existing = await this.matchesRepository.findById(id);
    if (!existing) throw new NotFoundException('Match not found');

    const updatedMatch = await this.matchesRepository.updateStatus(
      id,
      updateMatchStatusDto,
    );

    // Broadcast status real-time
    this.liveScoreGateway.broadcastMatchStatus(id, updatedMatch);

    return updatedMatch;
  }
}
