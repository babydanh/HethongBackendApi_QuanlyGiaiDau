import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../../../providers/redis/redis.service';
import { CommunitySocialRepository } from '../../communities/community-social.repository';
import * as schema from '../../../database/schema';
import { UpdateBracketSlotsDto } from '../dto/update-bracket-slots.dto';
import { TournamentsRepository } from '../tournaments.repository';
import { BracketGeneratorService } from '../bracket-generator.service';
import { UpdateStageDto } from '../dto/update-stage.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { TournamentAccessService } from './tournament-access.service';
import {
  inferAllowedSportRuleKinds,
  inferExpectedSportRuleKind,
  validateSportRuleConfig,
} from '../utils/sport-rules/validate-sport-rules-config';

@Injectable()
export class TournamentBracketService {
  private readonly logger = new Logger(TournamentBracketService.name);

  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly redisService: RedisService,
    private readonly communitySocialRepository: CommunitySocialRepository,
  ) {}
  async findBracket(id: string, divisionId?: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (divisionId) {
      const divisions =
        await this.tournamentsRepository.getDivisionsByTournament(id);
      const exists = divisions.some((division) => division.id === divisionId);
      if (!exists) {
        throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
      }
    }
    return this.tournamentsRepository.findBracket(id, divisionId);
  }
  async updateStage(
    stageId: string,
    userId: string,
    data: UpdateStageDto,
    systemRoles: string[] = [],
  ) {
    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage) throw new NotFoundException('Vòng đấu không tồn tại');

    const tournament = await this.tournamentsRepository.findById(
      stage.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // System ADMIN or Tournament creator can update
    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);

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
      throw new ForbiddenException('Bạn không có quyền cập nhật vòng đấu này');
    }

    if (data.roundConfig) {
      const category = await this.tournamentsRepository.findCategory(
        tournament.categoryId,
      );
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
      }

      validateSportRuleConfig(data.roundConfig, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'roundConfig',
        allowRoundStructure: true,
        allowRoundMetadata: true,
      });
    }

    return this.tournamentsRepository.updateStage(stageId, userId, data);
  }
  async updateGroup(
    groupId: string,
    userId: string,
    data: UpdateGroupDto,
    systemRoles: string[] = [],
  ) {
    const group = await this.tournamentsRepository.findGroupById(groupId);
    if (!group) throw new NotFoundException('Bảng đấu không tồn tại');

    const tournament = await this.tournamentsRepository.findById(
      group.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      isAuthorized = member?.role === 'OWNER' || member?.role === 'MODERATOR';
    }
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật bảng đấu này');
    }

    if (data.roundConfig) {
      const category = await this.tournamentsRepository.findCategory(
        tournament.categoryId,
      );
      if (!category) throw new NotFoundException('Hạng đấu không tồn tại');
      validateSportRuleConfig(data.roundConfig, {
        expectedKind: inferExpectedSportRuleKind({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        allowedKinds: inferAllowedSportRuleKinds({
          categoryConfig: category.categoryConfig as
            | Record<string, unknown>
            | null
            | undefined,
          categoryName: category.name,
          categorySlug: category.slug,
        }),
        sourceLabel: 'group.roundConfig',
        allowRoundStructure: true,
        allowRoundMetadata: true,
      });
    }

    return this.tournamentsRepository.updateGroup(groupId, userId, data);
  }
  async createPlayoffMatch(
    tournamentId: string,
    dto: { stageId: string; participant1Id: string; participant2Id: string },
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
        isAuthorized = true;
    }
    if (!isAuthorized)
      throw new ForbiddenException('Bạn không có quyền tạo trận playoff');

    const stage = await this.tournamentsRepository.findStageById(dto.stageId);
    if (!stage || stage.tournamentId !== tournamentId)
      throw new NotFoundException('Vòng đấu không tồn tại');
    if (stage.type !== 'ROUND_ROBIN')
      throw new BadRequestException(
        'Vòng loại trực tiếp chỉ khả dụng cho vòng đấu vòng tròn',
      );

    const { maxRound, maxOrder } =
      await this.tournamentsRepository.getMaxRoundAndMatchOrder(dto.stageId);
    const firstGroup = await this.tournamentsRepository.getGroupByStageId(
      dto.stageId,
    );
    if (!firstGroup)
      throw new BadRequestException('No group found in this stage');

    return this.tournamentsRepository.createPlayoffMatch({
      tournamentId,
      stageId: dto.stageId,
      groupId: firstGroup.id,
      participant1Id: dto.participant1Id,
      participant2Id: dto.participant2Id,
      roundNumber: maxRound + 1,
      matchOrder: maxOrder + 1,
    });
  }

  async finalizeStage(
    tournamentId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
        isAuthorized = true;
    }
    if (!isAuthorized)
      throw new ForbiddenException('Bạn không có quyền hoàn tất vòng đấu');

    const stage = await this.tournamentsRepository.findStageById(stageId);
    if (!stage || stage.tournamentId !== tournamentId)
      throw new NotFoundException('Vòng đấu không tồn tại');

    await this.tournamentsRepository.cancelScheduledMatchesInStage(stageId);
    return { message: 'Đã hoàn tất vòng đấu thành công' };
  }

  async advanceStandings(
    tournamentId: string,
    divisionId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
        isAuthorized = true;
    }
    if (!isAuthorized)
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật tiến trình vòng đấu',
      );

    return this.bracketGeneratorService.advanceStandings(
      tournamentId,
      divisionId,
      stageId,
    );
  }
  private async publishBracketUpdatePost(
    tournament: {
      communityId?: string | null;
      tournamentType?: string | null;
      name: string;
    },
    userId: string,
    tournamentId: string,
    division: { id?: string; name?: string | null } | undefined,
    generationResult: unknown,
  ) {
    if (tournament.tournamentType !== 'CLUB' || !tournament.communityId) return;

    const result =
      generationResult && typeof generationResult === 'object'
        ? (generationResult as Record<string, unknown>)
        : {};
    const stageIds = [result.stageId, result.stage1Id, result.stage2Id].filter(
      (stageId): stageId is string =>
        typeof stageId === 'string' && stageId.length > 0,
    );
    const totalMatches =
      typeof result.totalMatches === 'number' ||
      typeof result.totalMatches === 'string'
        ? String(result.totalMatches)
        : 'unknown';
    const bracketKey = stageIds.join(':') || `matches-${totalMatches}`;
    const divisionKey = division?.id ?? 'all';

    try {
      await this.communitySocialRepository.createTournamentBracketPost(
        tournament.communityId,
        userId,
        tournamentId,
        tournament.name,
        division?.name ?? null,
        `${divisionKey}:${bracketKey}`,
      );
    } catch (error) {
      console.error(
        'Failed to auto-post bracket update to community feed:',
        error,
      );
    }
  }
  async generateBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
    allowReset = false,
  ) {
    const existing = await this.tournamentsRepository.findById(id);
    if (!existing) throw new NotFoundException('Giải đấu không tồn tại');

    if (existing.status === 'IN_PROGRESS' || existing.status === 'COMPLETED') {
      throw new BadRequestException(
        'Không thể tạo lại sơ đồ thi đấu cho giải đang diễn ra hoặc đã kết thúc',
      );
    }

    // After REGISTRATION_CLOSED, only allow reset bracket once
    if (
      !allowReset &&
      (existing.status === 'REGISTRATION_CLOSED' ||
        existing.status === 'UPCOMING')
    ) {
      try {
        const bracket = await this.tournamentsRepository.findBracket(
          id,
          divisionId,
        );
        if (bracket && bracket.stages && bracket.stages.length > 0) {
          throw new BadRequestException(
            'Sơ đồ bảng đấu đã được chốt. Không thể tạo lại sau khi đăng ký đóng.',
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // If bracket query fails, allow reset (no existing bracket)
      }
    }

    let isAuthorized = await this.tournamentAccessService.isManager(existing, userId, systemRoles);

    if (!isAuthorized && existing.parentId) {
      const parent = await this.tournamentsRepository.findParentById(
        existing.parentId,
      );
      if (parent && parent.createdBy === userId) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && existing.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        existing.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized)
      throw new ForbiddenException('Bạn không có quyền tạo bảng thi đấu');
    const divisions =
      await this.tournamentsRepository.getDivisionsByTournament(id);
    let division: typeof schema.tournamentDivisions.$inferSelect | undefined;
    if (divisionId) {
      division = divisions.find((item) => item.id === divisionId);
      if (!division) {
        throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
      }
    } else if (divisions.length === 1) {
      division = divisions[0];
      divisionId = divisions[0].id;
    } else if (divisions.length > 1) {
      // If no divisionId is specified but tournament has multiple divisions,
      // check if this is a Lite tournament and default to first division
      const configCheck = (existing.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const isLiteTournament =
        (configCheck.isLite as boolean | undefined) === true ||
        configCheck.mode === 'LITE';
      if (isLiteTournament) {
        division = divisions[0];
        divisionId = divisions[0].id;
      }
    }

    const config = (existing.tournamentConfig || {}) as Record<string, unknown>;
    const isLite =
      (config.isLite as boolean | undefined) === true || config.mode === 'LITE';
    const isDoublesFormat =
      existing.matchType === 'DOUBLES' ||
      existing.matchType === 'MIXED_DOUBLES' ||
      division?.matchType === 'DOUBLES' ||
      division?.matchType === 'MIXED_DOUBLES';

    if (isLite && isDoublesFormat) {
      try {
        await this.tournamentsRepository.generateLitePairsTx(
          id,
          userId,
          'RANDOM',
        );
      } catch (_err) {
        // Silently proceed if already paired or < 2 pending participants
      }
    }

    const bracketType = (
      division?.bracketType ||
      (config.bracketType as string) ||
      'SINGLE_ELIMINATION'
    ).toUpperCase();

    if (bracketType === 'DOUBLE_ELIMINATION') {
      const result =
        await this.bracketGeneratorService.generateDoubleElimination(
          id,
          userId,
          divisionId,
          seedingType,
        );
      await this.publishBracketUpdatePost(
        existing,
        userId,
        id,
        division,
        result,
      );
      return result;
    } else if (bracketType === 'ROUND_ROBIN') {
      const result = await this.bracketGeneratorService.generateRoundRobin(
        id,
        userId,
        divisionId,
        seedingType,
      );
      await this.publishBracketUpdatePost(
        existing,
        userId,
        id,
        division,
        result,
      );
      return result;
    } else if (bracketType === 'GROUP_STAGE_KNOCKOUT') {
      // Keep the organizer's saved group configuration. The generator validates
      // the capacity and advancement rules against the eligible participants.
      const participants =
        await this.tournamentsRepository.findParticipantsForSeeding(
          id,
          divisionId,
        );
      const actualTeams = participants.length;

      if (actualTeams < 4) {
        throw new BadRequestException(
          'Cần ít nhất 4 đội để tạo vòng bảng + loại trực tiếp.',
        );
      }

      const result =
        await this.bracketGeneratorService.generateGroupStageKnockout(
          id,
          userId,
          divisionId,
          seedingType,
        );
      await this.publishBracketUpdatePost(
        existing,
        userId,
        id,
        division,
        result,
      );
      return result;
    } else {
      const result =
        await this.bracketGeneratorService.generateSingleElimination(
          id,
          userId,
          divisionId,
          seedingType,
        );
      await this.publishBracketUpdatePost(
        existing,
        userId,
        id,
        division,
        result,
      );
      return result;
    }
  }
  async updateBracketSlots(
    id: string,
    divisionId: string,
    userId: string,
    data: UpdateBracketSlotsDto,
    systemRoles: string[] = [],
  ) {
    if (!divisionId) {
      throw new BadRequestException(
        'divisionId là bắt buộc khi cập nhật bracket',
      );
    }

    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.parentId) {
      const parent = await this.tournamentsRepository.findParentById(
        tournament.parentId,
      );
      isAuthorized = parent?.createdBy === userId;
    }
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      isAuthorized = member?.role === 'OWNER' || member?.role === 'MODERATOR';
    }
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật bracket của giải đấu này',
      );
    }

    const divisions =
      await this.tournamentsRepository.getDivisionsByTournament(id);
    if (!divisions.some((division) => division.id === divisionId)) {
      throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
    }

    const result = await this.tournamentsRepository.updateBracketSlots(
      id,
      divisionId,
      userId,
      data,
    );

    try {
      await this.redisService.delByPattern('tournaments:list:*');
      await this.redisService.delByPattern('matches:list:*');
      await this.redisService.del(`matches:tournament:${id}`);
      await this.redisService.del(`tournament:${id}`);
    } catch (cacheErr) {
      this.logger.warn(
        `Failed to clear cache for tournament ${id}: ${cacheErr}`,
      );
    }

    return result;
  }
  async autoSeedFromElo(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    let isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized && tournament.communityId) {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR'))
        isAuthorized = true;
    }
    if (!isAuthorized)
      throw new ForbiddenException('Bạn không có quyền xếp hạt giống tự động');

    const participants =
      await this.tournamentsRepository.findParticipantsForSeeding(
        tournament.id,
        divisionId,
      );

    // Get matchType from tournament/division
    let matchType = tournament.matchType || 'DOUBLES';
    if (divisionId) {
      const division =
        await this.tournamentsRepository.findDivisionById(divisionId);
      if (division) {
        matchType = division.matchType || matchType;
      }
    }

    // Calculate ELO for each participant
    const eloEntries: Array<{ participantId: string; elo: number }> = [];
    for (const p of participants) {
      const members =
        (p as { members?: Array<{ userId: string }> }).members || [];
      if (members.length === 0) {
        eloEntries.push({ participantId: p.id, elo: 1000 });
        continue;
      }

      const elos = await Promise.all(
        members.map((m: { userId: string }) =>
          this.tournamentsRepository.getUserElo(
            m.userId,
            tournament.categoryId,
            matchType,
          ),
        ),
      );

      const effectiveElo =
        elos.length > 0
          ? Math.round(
              elos.reduce((a: number, b: number) => a + b, 0) / elos.length,
            )
          : 1000;

      eloEntries.push({ participantId: p.id, elo: effectiveElo });
    }

    // Sort by ELO descending, assign seeds
    eloEntries.sort((a, b) => b.elo - a.elo);
    const seeds = eloEntries.map((entry, index) => ({
      participantId: entry.participantId,
      seed: index + 1,
    }));

    await this.tournamentsRepository.updateSeeds(tournamentId, seeds);

    return { message: 'Auto seeding completed', seeds };
  }
  async updateSeeds(
    id: string,
    seeds: { participantId: string; seed: number }[],
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật hạt giống');
    }

    if (
      tournament.status === 'IN_PROGRESS' ||
      tournament.status === 'COMPLETED'
    ) {
      throw new BadRequestException(
        'Không thể cập nhật hạt giống cho giải đang diễn ra hoặc đã kết thúc',
      );
    }

    return this.tournamentsRepository.updateSeeds(id, seeds);
  }
}
