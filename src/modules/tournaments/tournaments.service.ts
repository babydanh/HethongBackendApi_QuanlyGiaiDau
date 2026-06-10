import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

  async create(userId: string, createTournamentDto: CreateTournamentDto, systemRoles: string[] = []) {
    if (createTournamentDto.communityId) {
      // Club level: User must be system ADMIN/ORGANIZER OR club OWNER/MODERATOR
      const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
      if (!isSystemAuthorized) {
        const member = await this.tournamentsRepository.findCommunityMember(
          createTournamentDto.communityId,
          userId,
        );
        if (!member || (member.role !== 'OWNER' && member.role !== 'MODERATOR')) {
          throw new ForbiddenException(
            'You do not have permission to create a tournament for this community. Must be OWNER or MODERATOR.'
          );
        }
      }
    } else {
      // Global level: User must be system ADMIN/ORGANIZER
      const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
      if (!isSystemAuthorized) {
        throw new ForbiddenException(
          'Only ADMIN or ORGANIZER can create global tournaments.'
        );
      }
    }
    return this.tournamentsRepository.create(userId, createTournamentDto);
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    // System ADMIN can update anything
    if (systemRoles.includes('ADMIN')) {
      return this.tournamentsRepository.update(id, userId, updateTournamentDto);
    }

    // Creator can update
    if (existing.createdBy === userId) {
      return this.tournamentsRepository.update(id, userId, updateTournamentDto);
    }

    // Community OWNER/MODERATOR can update
    if (existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        return this.tournamentsRepository.update(id, userId, updateTournamentDto);
      }
    }

    throw new ForbiddenException('You do not have permission to update this tournament');
  }

  async remove(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    // System ADMIN can delete
    if (systemRoles.includes('ADMIN')) {
      return this.tournamentsRepository.softDelete(id, userId);
    }

    // Creator can delete
    if (existing.createdBy === userId) {
      return this.tournamentsRepository.softDelete(id, userId);
    }

    // Community OWNER can delete
    if (existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && member.role === 'OWNER') {
        return this.tournamentsRepository.softDelete(id, userId);
      }
    }

    throw new ForbiddenException('You do not have permission to delete this tournament');
  }

  async generateBracket(id: string, userId: string) {
    return this.bracketGeneratorService.generateSingleElimination(id, userId);
  }

  async register(id: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    return this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto);
  }
}
