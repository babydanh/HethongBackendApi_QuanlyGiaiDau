import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TournamentsRepository } from './tournaments.repository';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { BracketGeneratorService } from './bracket-generator.service';
import { CategoryConfig } from './interfaces/tournament-config.interface';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
  ) {}

  private mapTournamentFormat(tournament: any) {
    if (tournament && tournament.tournamentConfig && (tournament.tournamentConfig as any).bracketType) {
      tournament.format = (tournament.tournamentConfig as any).bracketType;
    }
    return tournament;
  }

  async findAll(query: QueryTournamentDto) {
    const result = await this.tournamentsRepository.findAll(query);
    result.data = result.data.map(t => this.mapTournamentFormat(t));
    return result;
  }

  async findPublic(query: QueryTournamentDto) {
    const result = await this.tournamentsRepository.findAll({
      ...query,
      tournamentType: 'PUBLIC',
    });
    result.data = result.data
      .filter((t) => t.status !== 'DRAFT' && t.status !== 'CANCELLED')
      .map(t => this.mapTournamentFormat(t));
    return result;
  }

  async findMy(userId: string) {
    const result = await this.tournamentsRepository.findMyTournaments(userId);
    return result.map(t => this.mapTournamentFormat(t));
  }

  async findOne(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.mapTournamentFormat(tournament);
  }

  async create(userId: string, createTournamentDto: CreateTournamentDto, systemRoles: string[] = []) {
    // 1. Validate category existence and sportRules default fallback
    const category = await this.tournamentsRepository.findCategory(createTournamentDto.categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (!createTournamentDto.sportRules) {
      const config = category.categoryConfig as CategoryConfig;
      if (config && config.defaultSportRules) {
        createTournamentDto.sportRules = config.defaultSportRules;
      } else {
        createTournamentDto.sportRules = {};
      }
    }

    // 2. Validate dates
    if (createTournamentDto.registrationStartDate && createTournamentDto.registrationEndDate) {
      const regStart = new Date(createTournamentDto.registrationStartDate);
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      if (regEnd <= regStart) {
        throw new BadRequestException('Registration end date must be after registration start date');
      }
    }
    if (createTournamentDto.startDate && createTournamentDto.endDate) {
      const tStart = new Date(createTournamentDto.startDate);
      const tEnd = new Date(createTournamentDto.endDate);
      if (tEnd <= tStart) {
        throw new BadRequestException('Tournament end date must be after start date');
      }
    }
    if (createTournamentDto.registrationEndDate && createTournamentDto.startDate) {
      const regEnd = new Date(createTournamentDto.registrationEndDate);
      const tStart = new Date(createTournamentDto.startDate);
      if (tStart < regEnd) {
        throw new BadRequestException('Tournament start date must be after or equal to registration end date');
      }
    }

    // 3. CLUB vs PUBLIC validation rules & authorization
    const isSystemAuthorized = systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');

    if (createTournamentDto.tournamentType === 'CLUB') {
      if (!createTournamentDto.communityId) {
        throw new BadRequestException('Club tournaments must belong to a community');
      }
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0) {
        throw new BadRequestException('Club tournaments must be free');
      }
      if (createTournamentDto.galleryImages && createTournamentDto.galleryImages.length > 0) {
        throw new BadRequestException('Club tournaments cannot have gallery images at creation');
      }

      // Authorization for club tournament creation: System Admin/Organizer OR community Owner/Admin/Moderator
      if (!isSystemAuthorized) {
        const member = await this.tournamentsRepository.findCommunityMember(
          createTournamentDto.communityId,
          userId,
        );
        if (
          !member ||
          !['OWNER', 'ADMIN', 'MODERATOR'].includes(member.role) ||
          member.status !== 'JOINED'
        ) {
          throw new ForbiddenException(
            'Bạn phải là Quản trị viên hoặc Điều hành viên của câu lạc bộ mới có thể tạo giải đấu nội bộ.'
          );
        }
      }
    } else {
      // PUBLIC tournament
      if (createTournamentDto.entryFee && createTournamentDto.entryFee > 0 && createTournamentDto.entryFee < 100000) {
        throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
      }

      // Allow any authenticated user to create global public tournaments
    }

    const record = await this.tournamentsRepository.create(userId, createTournamentDto);
    return this.mapTournamentFormat(record);
  }

  async update(id: string, userId: string, updateTournamentDto: UpdateTournamentDto, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    // System ADMIN can update anything
    let canUpdate = systemRoles.includes('ADMIN');

    // Creator can update
    if (!canUpdate && existing.createdBy === userId) {
      canUpdate = true;
    }

    // Community OWNER/MODERATOR can update
    if (!canUpdate && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        canUpdate = true;
      }
    }

    if (!canUpdate) {
      throw new ForbiddenException('You do not have permission to update this tournament');
    }

    // Validations during update
    const regStartVal = updateTournamentDto.registrationStartDate !== undefined
      ? (updateTournamentDto.registrationStartDate ? new Date(updateTournamentDto.registrationStartDate) : null)
      : (existing.registrationStartDate ? new Date(existing.registrationStartDate) : null);

    const regEndVal = updateTournamentDto.registrationEndDate !== undefined
      ? (updateTournamentDto.registrationEndDate ? new Date(updateTournamentDto.registrationEndDate) : null)
      : (existing.registrationEndDate ? new Date(existing.registrationEndDate) : null);

    if (regStartVal && regEndVal && regEndVal <= regStartVal) {
      throw new BadRequestException('Registration end date must be after registration start date');
    }

    const tStartVal = updateTournamentDto.startDate !== undefined
      ? (updateTournamentDto.startDate ? new Date(updateTournamentDto.startDate) : null)
      : (existing.startDate ? new Date(existing.startDate) : null);

    const tEndVal = updateTournamentDto.endDate !== undefined
      ? (updateTournamentDto.endDate ? new Date(updateTournamentDto.endDate) : null)
      : (existing.endDate ? new Date(existing.endDate) : null);

    if (tStartVal && tEndVal && tEndVal <= tStartVal) {
      throw new BadRequestException('Tournament end date must be after start date');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'CLUB' && updateTournamentDto.entryFee > 0) {
      throw new BadRequestException('Club tournaments must remain free');
    }

    if (updateTournamentDto.entryFee && existing.tournamentType === 'PUBLIC' && updateTournamentDto.entryFee > 0 && updateTournamentDto.entryFee < 100000) {
      throw new BadRequestException('Minimum entry fee for paid public tournaments is 100,000đ');
    }

    const updated = await this.tournamentsRepository.update(id, userId, updateTournamentDto);
    return this.mapTournamentFormat(updated);
  }

  async remove(id: string, userId: string, systemRoles: string[] = []) {
    // ... rest of method ...
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Chỉ cho phép xóa giải đấu ở trạng thái nháp (DRAFT).');
    }

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

  async generateBracket(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || existing.createdBy === userId;

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to generate bracket for this tournament');
    }

    if (existing.status === 'REGISTRATION_CLOSED') {
      throw new BadRequestException('Vui lòng thanh toán lệ phí sàn trước khi sinh sơ đồ thi đấu.');
    }

    return this.bracketGeneratorService.generateSingleElimination(id, userId);
  }

  async register(id: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    return this.tournamentsRepository.registerParticipant(id, userId, registerTournamentDto);
  }

  async findParticipants(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.tournamentsRepository.findParticipants(id, tournament.categoryId);
  }

  async findBracket(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    return this.tournamentsRepository.findBracket(id);
  }

  async findByInviteCode(inviteCode: string) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Tournament not found for this invite code');
    }
    return this.mapTournamentFormat(tournament);
  }

  async joinByInviteCode(inviteCode: string, userId: string, registerTournamentDto: RegisterTournamentDto) {
    const tournament = await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Tournament not found for this invite code');
    }
    return this.tournamentsRepository.registerParticipant(tournament.id, userId, registerTournamentDto);
  }

  async regenerateInviteCode(id: string, userId: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    // Check authorization: Admin or Creator
    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to regenerate invite code');
    }

    const updated = await this.tournamentsRepository.regenerateInviteCode(id, userId);
    return this.mapTournamentFormat(updated);
  }

  async getGallery(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }
    return tournament.galleryImages || [];
  }

  async addGalleryImage(id: string, userId: string, url: string, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }

    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to add gallery image');
    }

    const galleryImages = [...(tournament.galleryImages || []), url];
    const updated = await this.tournamentsRepository.update(id, userId, { galleryImages });
    return this.mapTournamentFormat(updated);
  }

  async removeGalleryImage(id: string, userId: string, index: number, systemRoles: string[] = []) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException('Gallery is only available for public tournaments');
    }

    const isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;
    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to remove gallery image');
    }

    const currentImages = tournament.galleryImages || [];
    if (index < 0 || index >= currentImages.length) {
      throw new BadRequestException('Invalid gallery image index');
    }

    const galleryImages = currentImages.filter((_, idx) => idx !== index);
    const updated = await this.tournamentsRepository.update(id, userId, { galleryImages });
    return this.mapTournamentFormat(updated);
  }

  async publish(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || existing.createdBy === userId;

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to publish this tournament');
    }

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Tournament is not in DRAFT status');
    }

    const updated = await this.tournamentsRepository.update(id, userId, { status: 'REGISTRATION_OPEN' });
    return this.mapTournamentFormat(updated);
  }

  async lock(id: string, userId: string, systemRoles: string[] = []) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Tournament not found');

    let isAuthorized = systemRoles.includes('ADMIN') || existing.createdBy === userId;

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to lock this tournament');
    }

    if (existing.status !== 'REGISTRATION_OPEN' && existing.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException('Tournament registration must be open or closed to lock');
    }

    const participants = await this.tournamentsRepository.findParticipants(id, existing.categoryId);
    if (participants.length < 2) {
      throw new BadRequestException('Need at least 2 participants to lock and generate bracket');
    }

    const totalPlayers = participants.reduce((sum, p) => sum + (p.members?.length || 0), 0);
    const totalPlatformFee = totalPlayers * existing.platformFeePerPlayer;

    const isClubOrFree = existing.tournamentType === 'CLUB' || existing.platformFeePerPlayer === 0 || totalPlatformFee === 0;
    const targetStatus = isClubOrFree ? 'UPCOMING' : 'REGISTRATION_CLOSED';

    const updated = await this.tournamentsRepository.update(id, userId, { status: targetStatus });

    let bracket: { message: string; stageId: string; totalMatches: number } | null = null;
    if (isClubOrFree) {
      try {
        bracket = await this.bracketGeneratorService.generateSingleElimination(id, userId);
      } catch (err) {
        throw new BadRequestException('Failed to generate tournament bracket: ' + err.message);
      }
    }

    return {
      tournament: this.mapTournamentFormat(updated),
      summary: {
        totalParticipants: participants.length,
        totalPlayers,
        platformFeePerPlayer: existing.platformFeePerPlayer,
        totalPlatformFee,
      },
      bracket,
    };
  }

  async updateStage(stageId: string, userId: string, data: UpdateStageDto, systemRoles: string[] = []) {
    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage) throw new NotFoundException('Stage not found');

    const tournament = await this.tournamentsRepository.findById(stage.tournamentId);
    if (!tournament) throw new NotFoundException('Tournament not found');

    // System ADMIN or Tournament creator can update
    let isAuthorized = systemRoles.includes('ADMIN') || tournament.createdBy === userId;

    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have permission to update this stage');
    }

    return this.tournamentsRepository.updateStage(stageId, userId, data);
  }
}
