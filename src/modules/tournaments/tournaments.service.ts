import { Injectable, NotFoundException } from '@nestjs/common';
import { TournamentsRepository } from './tournaments.repository';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { BracketGeneratorService } from './bracket-generator.service';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
  ) {}

  async findAll(query: QueryTournamentDto) {
    return this.tournamentsRepository.findAll(query);
  }

  async findOne(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return tournament;
  }

  async create(userId: string, createTournamentDto: CreateTournamentDto) {
    return this.tournamentsRepository.create(userId, createTournamentDto);
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');
    return this.tournamentsRepository.update(id, userId, updateTournamentDto);
  }

  async remove(id: string, userId: string) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');
    return this.tournamentsRepository.softDelete(id, userId);
  }

  async generateBracket(id: string, userId: string) {
    return this.bracketGeneratorService.generateSingleElimination(id, userId);
  }

  async register(id: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    return this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto);
  }
}
