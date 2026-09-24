import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CreateDivisionDto,
  GenderRestriction,
} from '../dto/create-division.dto';
import { UpdateDivisionDto } from '../dto/update-division.dto';
import type { CategoryConfig } from '../interfaces/tournament-config.interface';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentFeePolicyService } from './tournament-fee-policy.service';
import {
  validateMatchTypeAgainstCategory,
  validateMatchTypeGenderRestriction,
} from '../utils/tournament-input-policy';
import {
  inferAllowedSportRuleKinds,
  inferExpectedSportRuleKind,
  validateSportRuleConfig,
} from '../utils/sport-rules/validate-sport-rules-config';

@Injectable()
export class TournamentDivisionService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly tournamentFeePolicyService: TournamentFeePolicyService,
  ) {}
  async createDivision(
    tournamentId: string,
    createDivisionDto: CreateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    try {
      const tournament =
        await this.tournamentsRepository.findById(tournamentId);
      if (!tournament) {
        throw new NotFoundException('Giải đấu không tồn tại');
      }

      if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
        throw new ForbiddenException(
          'Bạn không có quyền tạo bảng thi đấu cho giải này',
        );
      }

      // Fee semantics are explicit at the division boundary:
      // - unchecked/omitted => inherit the tournament fee (persist NULL)
      // - checked => persist the supplied amount, including 0 for free
      // Positive legacy payloads without the new flag remain overrides for
      // backwards compatibility; legacy 0 was the old inherit default.
      const feeMutation =
        this.tournamentFeePolicyService.resolveDivisionEntryFeeMutation(createDivisionDto);
      const entryFeeOverrideEnabled = feeMutation.enabled;
      const divisionEntryFee = feeMutation.fee;
      await this.tournamentFeePolicyService.assertEntryFeeAllowed(divisionEntryFee);

      const category = await this.tournamentsRepository.findCategory(
        tournament.categoryId,
      );
      if (!category) {
        throw new NotFoundException('Hạng đấu không tồn tại');
      }

      // Allow adding new divisions while tournament is in DRAFT, REGISTRATION_OPEN, etc.
      // Only block when the tournament is locked, completed or cancelled.
      if (
        tournament.isRegistrationLocked ||
        ['COMPLETED', 'CANCELLED'].includes(tournament.status)
      ) {
        throw new BadRequestException(
          'Không thể thêm nội dung thi đấu khi giải đấu đã khóa hoặc kết thúc.',
        );
      }

      const categoryConfig = category.categoryConfig as
        | CategoryConfig
        | null
        | undefined;
      validateMatchTypeAgainstCategory(categoryConfig, createDivisionDto.matchType, 'division');
      validateMatchTypeGenderRestriction(createDivisionDto.matchType, createDivisionDto.genderRestriction, 'division');

      if (createDivisionDto.roundConfig) {
        validateSportRuleConfig(createDivisionDto.roundConfig, {
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

      return await this.tournamentsRepository.createDivision(
        {
          name: createDivisionDto.name.trim(),
          matchType: createDivisionDto.matchType,
          genderRestriction: createDivisionDto.genderRestriction,
          maxParticipants:
            createDivisionDto.maxParticipants ??
            tournament.maxParticipants ??
            undefined,
          entryFee: divisionEntryFee,
          entryFeeOverrideEnabled,
          isConfigOverride: createDivisionDto.isConfigOverride,
          venueId: createDivisionDto.venueId,
          bracketType: createDivisionDto.bracketType,
          roundConfig: createDivisionDto.roundConfig,
          startDate: createDivisionDto.startDate,
          registrationEndDate: createDivisionDto.registrationEndDate,
          minElo: createDivisionDto.minElo,
          maxElo: createDivisionDto.maxElo,
          prizeDescription: createDivisionDto.prizeDescription,
          tournamentId,
        },
        userId,
      );
    } catch (error) {
      console.error(
        `Failed to create division for tournament ${tournamentId}:`,
        error,
      );
      throw error;
    }
  }

  async getDivisionsForTournament(tournamentId: string) {
    try {
      const tournament =
        await this.tournamentsRepository.findById(tournamentId);
      if (!tournament) {
        throw new NotFoundException('Giải đấu không tồn tại');
      }

      return await this.tournamentsRepository.getDivisionsByTournament(
        tournamentId,
      );
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      console.error(
        `Failed to get divisions for tournament ${tournamentId}:`,
        error,
      );
      throw error;
    }
  }

  async updateDivision(
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const isSystemAuthorized =
      systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isSystemAuthorized && !userId) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật bảng thi đấu này',
      );
    }

    const division =
      await this.tournamentsRepository.findDivisionById(divisionId);
    if (!division) {
      throw new NotFoundException('Bảng đấu không tồn tại');
    }

    const tournament = await this.tournamentsRepository.findById(
      division.tournamentId,
    );
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật bảng thi đấu này',
      );
    }

    const feeMutation = this.tournamentFeePolicyService.resolveDivisionEntryFeeMutation(updateDivisionDto);
    if (feeMutation.hasMutation) {
      await this.tournamentFeePolicyService.assertEntryFeeAllowed(feeMutation.fee);
    }

    const category = await this.tournamentsRepository.findCategory(
      tournament.categoryId,
    );
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    const nextMatchType = updateDivisionDto.matchType ?? division.matchType;
    let nextGenderRestriction =
      updateDivisionDto.genderRestriction !== undefined
        ? updateDivisionDto.genderRestriction
        : division.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (
      nextMatchType === 'MIXED_DOUBLES' &&
      nextGenderRestriction !== 'MIXED'
    ) {
      nextGenderRestriction = GenderRestriction.MIXED;
      updateDivisionDto.genderRestriction = GenderRestriction.MIXED;
    } else if (
      (nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') &&
      nextGenderRestriction === 'MIXED'
    ) {
      nextGenderRestriction = null;
      updateDivisionDto.genderRestriction = null;
    }

    const categoryConfig = category.categoryConfig as
      | CategoryConfig
      | null
      | undefined;
    validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
    validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');

    if (updateDivisionDto.roundConfig) {
      validateSportRuleConfig(updateDivisionDto.roundConfig, {
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

    if (updateDivisionDto.name !== undefined) {
      updateDivisionDto.name = updateDivisionDto.name.trim();
      if (!updateDivisionDto.name) {
        throw new BadRequestException(
          'Tên nội dung thi đấu không được để trống',
        );
      }
    }

    return this.tournamentsRepository.updateDivision(
      divisionId,
      updateDivisionDto,
      userId,
    );
  }

  async updateDivisionConfig(
    tournamentId: string,
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const canManage = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!canManage) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật cấu hình hình thức này',
      );
    }

    const feeMutation = this.tournamentFeePolicyService.resolveDivisionEntryFeeMutation(updateDivisionDto);
    if (feeMutation.hasMutation) {
      await this.tournamentFeePolicyService.assertEntryFeeAllowed(feeMutation.fee);
    }

    const currentDivision =
      await this.tournamentsRepository.findDivisionById(divisionId);
    if (!currentDivision) {
      throw new NotFoundException('Bảng đấu không tồn tại');
    }

    const category = await this.tournamentsRepository.findCategory(
      tournament.categoryId,
    );
    if (!category) {
      throw new NotFoundException('Hạng đấu không tồn tại');
    }

    const nextMatchType =
      updateDivisionDto.matchType ?? currentDivision.matchType;
    let nextGenderRestriction =
      updateDivisionDto.genderRestriction !== undefined
        ? updateDivisionDto.genderRestriction
        : currentDivision.genderRestriction;

    // Auto-heal corrupted gender restriction in database
    if (
      nextMatchType === 'MIXED_DOUBLES' &&
      nextGenderRestriction !== 'MIXED'
    ) {
      nextGenderRestriction = GenderRestriction.MIXED;
      updateDivisionDto.genderRestriction = GenderRestriction.MIXED;
    } else if (
      (nextMatchType === 'SINGLES' || nextMatchType === 'DOUBLES') &&
      nextGenderRestriction === 'MIXED'
    ) {
      nextGenderRestriction = null;
      updateDivisionDto.genderRestriction = null;
    }

    const formatChanged =
      String(nextMatchType) !== String(currentDivision.matchType) ||
      nextGenderRestriction !== currentDivision.genderRestriction;
    if (formatChanged) {
      const participantCount =
        await this.tournamentsRepository.countDivisionParticipants(divisionId);
      if (participantCount > 0) {
        throw new BadRequestException(
          'Không thể thay đổi hình thức thi đấu khi bảng đấu đã có vận động viên đăng ký',
        );
      }
      if (
        tournament.status !== 'DRAFT' &&
        tournament.status !== 'REGISTRATION_OPEN'
      ) {
        throw new BadRequestException(
          'Chỉ được thay đổi hình thức thi đấu trước khi đóng đăng ký và tạo lịch thi đấu',
        );
      }
    }

    const categoryConfig = category.categoryConfig as
      | CategoryConfig
      | null
      | undefined;
    validateMatchTypeAgainstCategory(categoryConfig, nextMatchType, 'division');
    validateMatchTypeGenderRestriction(nextMatchType, nextGenderRestriction, 'division');

    if (updateDivisionDto.roundConfig) {
      validateSportRuleConfig(updateDivisionDto.roundConfig, {
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

    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật cấu hình hình thức này',
      );
    }
    return this.tournamentsRepository.updateDivisionConfig(
      divisionId,
      updateDivisionDto,
      userId,
    );
  }

  async deleteDivision(
    divisionId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const isSystemAuthorized =
      systemRoles.includes('ADMIN') || systemRoles.includes('ORGANIZER');
    if (!isSystemAuthorized && !userId) {
      throw new ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
    }

    const division =
      await this.tournamentsRepository.findDivisionById(divisionId);
    if (!division) throw new NotFoundException('Bảng thi đấu không tồn tại');
    const tournament = await this.tournamentsRepository.findById(
      division.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');
    if (!(await this.tournamentAccessService.isManager(tournament, userId, systemRoles))) {
      throw new ForbiddenException('Bạn không có quyền xóa bảng thi đấu này');
    }
    return this.tournamentsRepository.deleteDivision(divisionId, userId);
  }

  async getParticipantsByDivision(tournamentId: string, divisionId: string) {
    const divisions =
      await this.tournamentsRepository.getDivisionsByTournament(tournamentId);
    const exists = divisions.some((division) => division.id === divisionId);
    if (!exists) {
      throw new NotFoundException('Không tìm thấy bảng đấu cho giải đấu này');
    }

    return this.tournamentsRepository.getParticipantsByDivision(divisionId);
  }
}
