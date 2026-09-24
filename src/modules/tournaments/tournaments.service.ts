import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDeepStrictEqual } from 'node:util';
import { TournamentsRepository } from './tournaments.repository';
import { TournamentAccessService } from './services/tournament-access.service';
import { TournamentVenueService } from './services/tournament-venue.service';
import { TournamentMediaService } from './services/tournament-media.service';
import { TournamentDiscoveryService } from './services/tournament-discovery.service';
import { TournamentLifecycleService } from './services/tournament-lifecycle.service';
import { TournamentFeePolicyService } from './services/tournament-fee-policy.service';
import { TournamentStaffService } from './services/tournament-staff.service';
import { TournamentRefereeService } from './services/tournament-referee.service';
import { TournamentFollowService } from './services/tournament-follow.service';
import { TournamentDivisionService } from './services/tournament-division.service';
import { TournamentParticipantAdminService } from './services/tournament-participant-admin.service';
import { TournamentImportService } from './services/tournament-import.service';
import { TournamentResultsService } from './services/tournament-results.service';
import { TournamentBracketService } from './services/tournament-bracket.service';
import { TournamentRealtimeService } from './services/tournament-realtime.service';
import { TournamentRegistrationService } from './services/tournament-registration.service';
import { TournamentLiteService } from './services/tournament-lite.service';
import { TournamentFootballRosterService } from './services/tournament-football-roster.service';
import {
  applyDefaultDoublesPairingMode,
  validateMatchTypeAgainstCategory,
  validateMatchTypeGenderRestriction,
  validateRegistrationMode,
} from './utils/tournament-input-policy';
import { mapTournamentFormat } from './utils/tournament-presentation';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { CreateTournamentVenueDto } from './dto/create-tournament-venue.dto';
import { CreateLiteTournamentDto } from './dto/create-lite-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { QueryTournamentDto } from './dto/query-tournament.dto';
import { QueryMyManagementTournamentsDto } from './dto/query-my-management-tournaments.dto';
import { RegisterTournamentDto } from './dto/register-tournament.dto';
import { UpdateFootballRosterDto } from './dto/update-football-roster.dto';
import { PairLiteParticipantsDto } from './dto/pair-lite-participants.dto';
import { GenerateLitePairsDto } from './dto/generate-lite-pairs.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CreateParentTournamentDto } from './dto/create-parent-tournament.dto';
import { UpdateParentTournamentDto } from './dto/update-parent-tournament.dto';
import { ImportParticipantsDto } from './dto/import-participants.dto';
import { MailService } from '../../providers/mail/mail.service';
import { BracketGeneratorService } from './bracket-generator.service';
import {
  CategoryConfig,
  TournamentConfig,
} from './interfaces/tournament-config.interface';
import { EloCapViolationException } from './exceptions/elo-cap-violation.exception';
import * as schema from '../../database/schema';
import { PaymentStatus } from '../../common/constants/enums';
import { NotificationsService } from '../notifications/notifications.service';

import {
  CreateDivisionDto,
  DivisionBracketType,
  GenderRestriction,
  MatchType,
} from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';
import { UpdateBracketSlotsDto } from './dto/update-bracket-slots.dto';
import { resolveEffectiveSportRules } from './utils/sport-rules/resolve-effective-sport-rules';
import {
  canOpenRegistrationImmediately,
  isRegistrationDeadlineExpired,
  isRegistrationOpenStatus,
} from './utils/registration-lifecycle';
import {
  inferAllowedSportRuleKinds,
  inferExpectedSportRuleKind,
  validateSportRuleConfig,
} from './utils/sport-rules/validate-sport-rules-config';
import {
  buildOrganizerNewRegistrationNotification,
  buildFootballRosterConfirmationNotification,
  buildOrganizerTeamCompletedNotification,
  buildParticipantKickedNotification,
  buildParticipantPendingTeammateNotification,
  buildParticipantRegistrationPendingNotification,
  buildParticipantRegistrationRejectedNotification,
  buildParticipantRegistrationSuccessNotification,
  buildParticipantTeammateJoinedNotification,
  buildParticipantWithdrawnNotification,
  buildPartnerInviteAcceptedNotification,
  buildPartnerInviteCancelledNotification,
  buildPartnerInviteReceivedNotification,
  buildPartnerInviteRejectedNotification,
  buildRefereeInviteAcceptedNotification,
  buildRefereeInviteDeclinedNotification,
  buildRefereeInviteNotification,
  buildRefereeInviteRevokedNotification,
  buildReservedSlotAssignedNotification,
  buildRegistrationCancelledFullNotification,
  buildStaffAddedNotification,
  buildTournamentCancelledNotification,
  buildCommunityPostNewNotification,
} from '../notifications/notification-builder';
import { RedisService } from '../../providers/redis/redis.service';
import { StorageService } from '../../providers/storage/storage.service';
import {
  isStoredImageUrl,
  extractStoredImagePublicId,
} from '../../common/helpers/cloudinary.helper';
import { CommunitySocialRepository } from '../communities/community-social.repository';
import { validateFootballRosterSelection } from './utils/football-roster-validation';
import {
  normalizeGenderRestriction,
  normalizeProfileGender,
} from '../../common/helpers/gender.helper';
import {
  assertValidFootballTeamConfig,
  resolveFootballTeamConfig,
} from './utils/football-team-config';
import {
  groupTournamentResultMembers,
  selectTopTournamentStandings,
} from './utils/tournament-results';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CreateVenueCourtDto } from '../venues/dto/create-venue-court.dto';
import { CreateVenueDto } from '../venues/dto/create-venue.dto';
import { UpdateVenueDto } from '../venues/dto/update-venue.dto';
import { CreateBatchCourtsDto } from '../venues/dto/create-batch-courts.dto';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
    private readonly notificationsService: NotificationsService,
    private readonly storageService: StorageService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly communitySocialRepository: CommunitySocialRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly tournamentVenueService: TournamentVenueService,
    private readonly tournamentMediaService: TournamentMediaService,
    private readonly tournamentDiscoveryService: TournamentDiscoveryService,
    private readonly tournamentLifecycleService: TournamentLifecycleService,
    private readonly tournamentFeePolicyService: TournamentFeePolicyService,
    private readonly tournamentStaffService: TournamentStaffService,
    private readonly tournamentRefereeService: TournamentRefereeService,
    private readonly tournamentFollowService: TournamentFollowService,
    private readonly tournamentResultsService: TournamentResultsService,
    private readonly tournamentDivisionService: TournamentDivisionService,
    private readonly tournamentParticipantAdminService: TournamentParticipantAdminService,
    private readonly tournamentImportService: TournamentImportService,
    private readonly tournamentBracketService: TournamentBracketService,
    private readonly tournamentRealtimeService: TournamentRealtimeService,
    private readonly tournamentRegistrationService: TournamentRegistrationService,
    private readonly tournamentLiteService: TournamentLiteService,
    private readonly tournamentFootballRosterService: TournamentFootballRosterService,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private broadcastRegistrationChanged(
    tournamentId: string,
    payload: {
      participantId?: string;
      divisionId?: string | null;
      action: string;
    },
  ) {
    this.tournamentRealtimeService.broadcastRegistrationChanged(
      tournamentId,
      payload,
    );
  }

  /**
   * Kiểm tra quyền quản lý giải đấu: ADMIN / ORGANIZER hệ thống,
   * chủ giải (createdBy) hoặc đồng tổ chức (CO_ORGANIZER trong tournamentStaff).
   */

  private async isManager(
    tournament: {
      id: string;
      createdBy: string | null;
      communityId?: string | null;
    },
    userId: string,
    systemRoles: string[] = [],
  ): Promise<boolean> {
    return this.tournamentAccessService.isManager(
      tournament,
      userId,
      systemRoles,
    );
  }

  private isSystemTournamentCreator(systemRoles: string[] = []): boolean {
    return this.tournamentAccessService.isSystemTournamentCreator(systemRoles);
  }

  private async assertCommunityTournamentCreator(
    communityId: string,
    userId: string,
    systemRoles: string[] = [],
  ): Promise<void> {
    return this.tournamentAccessService.assertCommunityTournamentCreator(
      communityId,
      userId,
      systemRoles,
    );
  }

  // ═══════════════ Ràng buộc GIỚI TÍNH khi ghép đôi ═══════════════
  // Gotcha: profile lưu giới tính tiếng Việt ('Nữ'/'Nam'), division lưu
  // 'FEMALE'/'MALE'/'MIXED' → phải normalize CẢ 2 PHÍA trước khi so sánh.

  /**
   * Chặn đội vi phạm genderRestriction của division.
   * - 'MALE'/'FEMALE': mọi thành viên ĐÃ BIẾT giới phải trùng.
   * - 'MIXED' (MIXED_DOUBLES): cặp phải đủ 1 nam + 1 nữ.
   * null/COED hoặc có thành viên giới không nhận biết → bỏ qua.
   */

  /**
   * Team sport (bóng đá): đội trưởng mời 1 thành viên (userId) vào đội với role MAIN/RESERVE.
   */

  /**
   * Team sport: đội trưởng xoá thành viên khỏi đội.
   */

  /**
   * Mã mời chỉ có hiệu lực khi giải đã được công bố và không bị khóa.
   * Giải DRAFT/PENDING_APPROVAL ẩn hoàn toàn; SUSPENDED/CANCELLED chặn truy cập.
   */

  // ──────── Staff ────────

  // ──── Lite authorization helper ────

  // ──── Lite pairing ────

  async getTournamentVenuesWithCourts(
    tournamentId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.getTournamentVenuesWithCourts(
      tournamentId,
      user,
      systemRoles,
    );
  }

  async createTournamentVenue(
    tournamentId: string,
    dto: CreateTournamentVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.createTournamentVenue(
      tournamentId,
      dto,
      user,
      systemRoles,
    );
  }

  async updateTournamentVenue(
    tournamentId: string,
    venueId: string,
    dto: UpdateVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.updateTournamentVenue(
      tournamentId,
      venueId,
      dto,
      user,
      systemRoles,
    );
  }

  async setDefaultTournamentVenue(
    tournamentId: string,
    venueId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.setDefaultTournamentVenue(
      tournamentId,
      venueId,
      user,
      systemRoles,
    );
  }

  async deleteTournamentVenue(
    tournamentId: string,
    venueId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.deleteTournamentVenue(
      tournamentId,
      venueId,
      user,
      systemRoles,
    );
  }

  async saveTournamentVenue(
    tournamentId: string,
    dto: CreateVenueDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.saveTournamentVenue(
      tournamentId,
      dto,
      user,
      systemRoles,
    );
  }

  async getTournamentCourts(
    tournamentId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.getTournamentCourts(
      tournamentId,
      user,
      systemRoles,
    );
  }

  async addTournamentCourt(
    tournamentId: string,
    dto: CreateVenueCourtDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.addTournamentCourt(
      tournamentId,
      dto,
      user,
      systemRoles,
    );
  }

  async addTournamentCourtsBatch(
    tournamentId: string,
    dto: CreateBatchCourtsDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.addTournamentCourtsBatch(
      tournamentId,
      dto,
      user,
      systemRoles,
    );
  }

  async removeTournamentCourt(
    tournamentId: string,
    courtId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.removeTournamentCourt(
      tournamentId,
      courtId,
      user,
      systemRoles,
    );
  }

  async addVenueCourtDirect(
    tournamentId: string,
    venueId: string,
    dto: CreateVenueCourtDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.addVenueCourtDirect(
      tournamentId,
      venueId,
      dto,
      user,
      systemRoles,
    );
  }

  async addVenueCourtsBatchDirect(
    tournamentId: string,
    venueId: string,
    dto: CreateBatchCourtsDto,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.addVenueCourtsBatchDirect(
      tournamentId,
      venueId,
      dto,
      user,
      systemRoles,
    );
  }

  async removeVenueCourtDirect(
    tournamentId: string,
    venueId: string,
    courtId: string,
    user: JwtPayload,
    systemRoles: string[] = [],
  ) {
    return this.tournamentVenueService.removeVenueCourtDirect(
      tournamentId,
      venueId,
      courtId,
      user,
      systemRoles,
    );
  }
  private async cleanupTournamentImages(tournament: {
    galleryImages?: string[] | null;
    bannerUrl?: string | null;
    logoUrl?: string | null;
  }) {
    return this.tournamentMediaService.cleanupTournamentImages(tournament);
  }

  async uploadRegistrationAttachment(
    tournamentId: string,
    userId: string,
    fieldId: string | undefined,
    file: Express.Multer.File,
  ) {
    return this.tournamentMediaService.uploadRegistrationAttachment(
      tournamentId,
      userId,
      fieldId,
      file,
      (tournament) => this.assertRegistrationAccessible(tournament),
    );
  }

  async getGallery(id: string) {
    return this.tournamentMediaService.getGallery(id);
  }

  async addGalleryImage(
    id: string,
    userId: string,
    url: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentMediaService.addGalleryImage(
      id,
      userId,
      url,
      systemRoles,
    );
  }

  async removeGalleryImage(
    id: string,
    userId: string,
    index: number,
    systemRoles: string[] = [],
  ) {
    return this.tournamentMediaService.removeGalleryImage(
      id,
      userId,
      index,
      systemRoles,
    );
  }
  async findAll(query: QueryTournamentDto) {
    return this.tournamentDiscoveryService.findAll(query);
  }

  async findPublic(query: QueryTournamentDto) {
    return this.tournamentDiscoveryService.findPublic(query);
  }

  async findMy(userId: string) {
    return this.tournamentDiscoveryService.findMy(userId);
  }

  async findMyManagement(
    userId: string,
    query: QueryMyManagementTournamentsDto,
  ) {
    return this.tournamentDiscoveryService.findMyManagement(userId, query);
  }

  async getMyWorkspace(userId: string, includeRefereeMatches = true) {
    return this.tournamentDiscoveryService.getMyWorkspace(
      userId,
      includeRefereeMatches,
    );
  }

  async findOne(
    id: string,
    userId?: string | null,
    inviteCode?: string,
    systemRoles: string[] = [],
    participantId?: string,
    teamInviteToken?: string,
    managementAccess = false,
  ) {
    return this.tournamentDiscoveryService.findOne(
      id,
      userId,
      inviteCode,
      systemRoles,
      participantId,
      teamInviteToken,
      managementAccess,
    );
  }

  async findParticipants(id: string, divisionId?: string) {
    return this.tournamentDiscoveryService.findParticipants(id, divisionId);
  }

  async findParticipantsForOrganizer(
    id: string,
    divisionId: string | undefined,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentDiscoveryService.findParticipantsForOrganizer(
      id,
      divisionId,
      userId,
      systemRoles,
    );
  }
  async createParent(
    userId: string,
    data: CreateParentTournamentDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.createParent(
      userId,
      data,
      systemRoles,
    );
  }

  async updateParent(
    id: string,
    userId: string,
    data: UpdateParentTournamentDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.updateParent(
      id,
      userId,
      data,
      systemRoles,
    );
  }

  async findParentById(id: string) {
    return this.tournamentLifecycleService.findParentById(id);
  }

  async findParentsByUser(userId: string) {
    return this.tournamentLifecycleService.findParentsByUser(userId);
  }

  async getParentWithAggregation(parentId: string) {
    return this.tournamentLifecycleService.getParentWithAggregation(parentId);
  }

  async updateParentAggregation(parentId: string) {
    return this.tournamentLifecycleService.updateParentAggregation(parentId);
  }
  private async assertEntryFeeAllowed(entryFee: number | null | undefined) {
    return this.tournamentFeePolicyService.assertEntryFeeAllowed(entryFee);
  }

  private resolveDivisionEntryFeeMutation(dto: {
    entryFee?: number | null;
    entryFeeOverrideEnabled?: boolean;
  }) {
    return this.tournamentFeePolicyService.resolveDivisionEntryFeeMutation(dto);
  }

  async getFeesConfig() {
    return this.tournamentFeePolicyService.getFeesConfig();
  }

  private async getPublishFee(
    tournamentType?: string | null,
    isRanked?: boolean | null,
  ) {
    return this.tournamentFeePolicyService.getPublishFee(
      tournamentType,
      isRanked,
    );
  }
  async findStaffByTournament(id: string) {
    return this.tournamentStaffService.findStaffByTournament(id);
  }

  async addStaffMember(
    id: string,
    email: string,
    role: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentStaffService.addStaffMember(
      id,
      email,
      role,
      userId,
      systemRoles,
    );
  }

  async removeStaffMember(
    id: string,
    staffUserId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentStaffService.removeStaffMember(
      id,
      staffUserId,
      userId,
      systemRoles,
    );
  }

  async findReferees(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentRefereeService.findReferees(id, userId, systemRoles);
  }

  async addReferee(
    id: string,
    email: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentRefereeService.addReferee(
      id,
      email,
      userId,
      systemRoles,
    );
  }

  async respondToRefereeInvite(
    tournamentId: string,
    refereeId: string,
    userId: string,
    action: 'ACCEPT' | 'DECLINE',
  ) {
    return this.tournamentRefereeService.respondToRefereeInvite(
      tournamentId,
      refereeId,
      userId,
      action,
    );
  }

  async revokeRefereeInvite(
    tournamentId: string,
    refereeId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentRefereeService.revokeRefereeInvite(
      tournamentId,
      refereeId,
      userId,
      systemRoles,
    );
  }

  async followTournament(id: string, userId: string) {
    return this.tournamentFollowService.followTournament(id, userId);
  }

  async unfollowTournament(id: string, userId: string) {
    return this.tournamentFollowService.unfollowTournament(id, userId);
  }

  async getFollowerUserIds(tournamentId: string): Promise<string[]> {
    return this.tournamentFollowService.getFollowerUserIds(tournamentId);
  }

  async getFollowedTournaments(userId: string) {
    return this.tournamentFollowService.getFollowedTournaments(userId);
  }
  async getGroupStandings(tournamentId: string, divisionId?: string) {
    return this.tournamentResultsService.getGroupStandings(
      tournamentId,
      divisionId,
    );
  }

  async getTournamentResults(tournamentId: string, divisionId?: string) {
    return this.tournamentResultsService.getTournamentResults(
      tournamentId,
      divisionId,
    );
  }

  async getTournamentResultsV2(tournamentId: string, divisionId?: string) {
    return this.tournamentResultsService.getTournamentResultsV2(
      tournamentId,
      divisionId,
    );
  }
  async createDivision(
    tournamentId: string,
    createDivisionDto: CreateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentDivisionService.createDivision(
      tournamentId,
      createDivisionDto,
      userId,
      systemRoles,
    );
  }

  async getDivisionsForTournament(tournamentId: string) {
    return this.tournamentDivisionService.getDivisionsForTournament(
      tournamentId,
    );
  }

  async updateDivision(
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentDivisionService.updateDivision(
      divisionId,
      updateDivisionDto,
      userId,
      systemRoles,
    );
  }

  async updateDivisionConfig(
    tournamentId: string,
    divisionId: string,
    updateDivisionDto: UpdateDivisionDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentDivisionService.updateDivisionConfig(
      tournamentId,
      divisionId,
      updateDivisionDto,
      userId,
      systemRoles,
    );
  }

  async deleteDivision(
    divisionId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentDivisionService.deleteDivision(
      divisionId,
      userId,
      systemRoles,
    );
  }

  async getParticipantsByDivision(tournamentId: string, divisionId: string) {
    return this.tournamentDivisionService.getParticipantsByDivision(
      tournamentId,
      divisionId,
    );
  }
  async seedMockParticipants(
    tournamentId: string,
    userId: string,
    names: string[],
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    return this.tournamentParticipantAdminService.seedMockParticipants(
      tournamentId,
      userId,
      names,
      systemRoles,
      divisionId,
    );
  }

  async clearMockParticipants(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    return this.tournamentParticipantAdminService.clearMockParticipants(
      tournamentId,
      userId,
      systemRoles,
      divisionId,
    );
  }

  async deleteMockParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentParticipantAdminService.deleteMockParticipant(
      tournamentId,
      participantId,
      userId,
      systemRoles,
      (id, payload) => this.broadcastRegistrationChanged(id, payload),
    );
  }

  async updateParticipantStatus(
    tournamentId: string,
    participantId: string,
    status: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentParticipantAdminService.updateParticipantStatus(
      tournamentId,
      participantId,
      status,
      userId,
      systemRoles,
      (id, payload) => this.broadcastRegistrationChanged(id, payload),
    );
  }
  async importParticipantsFromForm(
    tournamentId: string,
    userId: string,
    systemRoles: string[],
    dto: ImportParticipantsDto,
  ) {
    return this.tournamentImportService.importParticipantsFromForm(
      tournamentId,
      userId,
      systemRoles,
      dto,
      (id, payload) => this.broadcastRegistrationChanged(id, payload),
    );
  }
  async findBracket(id: string, divisionId?: string) {
    return this.tournamentBracketService.findBracket(id, divisionId);
  }

  async updateStage(
    stageId: string,
    userId: string,
    data: UpdateStageDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.updateStage(
      stageId,
      userId,
      data,
      systemRoles,
    );
  }

  async updateGroup(
    groupId: string,
    userId: string,
    data: UpdateGroupDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.updateGroup(
      groupId,
      userId,
      data,
      systemRoles,
    );
  }

  async createPlayoffMatch(
    tournamentId: string,
    dto: { stageId: string; participant1Id: string; participant2Id: string },
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.createPlayoffMatch(
      tournamentId,
      dto,
      userId,
      systemRoles,
    );
  }

  async finalizeStage(
    tournamentId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.finalizeStage(
      tournamentId,
      stageId,
      userId,
      systemRoles,
    );
  }

  async advanceStandings(
    tournamentId: string,
    divisionId: string,
    stageId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.advanceStandings(
      tournamentId,
      divisionId,
      stageId,
      userId,
      systemRoles,
    );
  }
  async generateBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    seedingType?: 'SEEDED' | 'RANDOM',
    allowReset = false,
  ) {
    return this.tournamentBracketService.generateBracket(
      id,
      userId,
      systemRoles,
      divisionId,
      seedingType,
      allowReset,
    );
  }

  async updateBracketSlots(
    id: string,
    divisionId: string,
    userId: string,
    data: UpdateBracketSlotsDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.updateBracketSlots(
      id,
      divisionId,
      userId,
      data,
      systemRoles,
    );
  }

  async autoSeedFromElo(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    return this.tournamentBracketService.autoSeedFromElo(
      tournamentId,
      userId,
      systemRoles,
      divisionId,
    );
  }

  async updateSeeds(
    id: string,
    seeds: { participantId: string; seed: number }[],
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentBracketService.updateSeeds(
      id,
      seeds,
      userId,
      systemRoles,
    );
  }
  assertRegistrationAccessible(
    tournament: {
      status?: string | null;
      inviteCode?: string | null;
      registrationStartDate?: Date | string | null;
      registrationEndDate?: Date | string | null;
      isRegistrationLocked?: boolean | null;
    },
    options?: { inviteCode?: string; allowDraft?: boolean },
  ) {
    return this.tournamentRegistrationService.assertRegistrationAccessible(
      tournament,
      options,
    );
  }

  async register(
    id: string,
    userId: string,
    registerTournamentDto: RegisterTournamentDto,
    inviteCode?: string,
    actorUserId?: string,
  ) {
    return this.tournamentRegistrationService.register(
      id,
      userId,
      registerTournamentDto,
      inviteCode,
      actorUserId,
      (tournamentId, seedUserId, systemRoles, divisionId) =>
        this.tournamentBracketService.autoSeedFromElo(
          tournamentId,
          seedUserId,
          systemRoles,
          divisionId,
        ),
    );
  }

  async joinTeam(
    tournamentId: string,
    userId: string,
    participantId: string,
    teamInviteToken: string,
  ) {
    return this.tournamentRegistrationService.joinTeam(
      tournamentId,
      userId,
      participantId,
      teamInviteToken,
    );
  }

  async addTeamMember(
    participantId: string,
    userId: string,
    memberUserId: string,
    role: 'MAIN' | 'RESERVE',
  ) {
    return this.tournamentRegistrationService.addTeamMember(
      participantId,
      userId,
      memberUserId,
      role,
    );
  }

  async removeTeamMember(
    participantId: string,
    userId: string,
    memberUserId: string,
  ) {
    return this.tournamentRegistrationService.removeTeamMember(
      participantId,
      userId,
      memberUserId,
    );
  }

  async withdraw(
    tournamentId: string,
    userId: string,
    bankData?: {
      bankName?: string;
      bankAccountNumber?: string;
      bankAccountName?: string;
    },
    divisionId?: string,
  ) {
    return this.tournamentRegistrationService.withdraw(
      tournamentId,
      userId,
      bankData,
      divisionId,
    );
  }

  async myRegistration(
    tournamentId: string,
    userId: string,
    divisionId?: string,
  ) {
    return this.tournamentRegistrationService.myRegistration(
      tournamentId,
      userId,
      divisionId,
    );
  }

  async findByInviteCode(inviteCode: string) {
    return this.tournamentRegistrationService.findByInviteCode(inviteCode);
  }

  async joinByInviteCode(
    inviteCode: string,
    userId: string,
    registerTournamentDto: RegisterTournamentDto,
  ) {
    return this.tournamentRegistrationService.joinByInviteCode(
      inviteCode,
      userId,
      registerTournamentDto,
      (tournamentId, seedUserId, systemRoles, divisionId) =>
        this.tournamentBracketService.autoSeedFromElo(
          tournamentId,
          seedUserId,
          systemRoles,
          divisionId,
        ),
    );
  }

  async reopenRegistration(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentRegistrationService.reopenRegistration(
      id,
      userId,
      systemRoles,
    );
  }

  async regenerateInviteCode(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentRegistrationService.regenerateInviteCode(
      id,
      userId,
      systemRoles,
    );
  }

  async validateInvite(id: string, inviteCode: string) {
    return this.tournamentRegistrationService.validateInvite(id, inviteCode);
  }

  async kickParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    reason?: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentRegistrationService.kickParticipant(
      tournamentId,
      participantId,
      userId,
      reason,
      systemRoles,
    );
  }

  async acceptPartnerInvite(participantId: string, partnerUserId: string) {
    return this.tournamentRegistrationService.acceptPartnerInvite(
      participantId,
      partnerUserId,
    );
  }

  async rejectPartnerInvite(participantId: string, partnerUserId: string) {
    return this.tournamentRegistrationService.rejectPartnerInvite(
      participantId,
      partnerUserId,
    );
  }
  async createLite(
    userId: string,
    dto: CreateLiteTournamentDto,
    systemRoles: string[] = [],
    isEmailVerified?: boolean,
    isMock?: boolean,
  ) {
    return this.tournamentLiteService.createLite(
      userId,
      dto,
      (tournamentId, cleanupUserId, roles) =>
        this.remove(tournamentId, cleanupUserId, roles),
      systemRoles,
      isEmailVerified,
      isMock,
    );
  }

  async getLiteJoinStatus(inviteCode: string, userId?: string) {
    return this.tournamentLiteService.getLiteJoinStatus(inviteCode, userId);
  }

  async joinLite(inviteCode: string, userId: string) {
    return this.tournamentLiteService.joinLite(inviteCode, userId);
  }

  async updateLiteBracketSlots(
    id: string,
    divisionId: string,
    userId: string,
    data: UpdateBracketSlotsDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLiteService.updateLiteBracketSlots(
      id,
      divisionId,
      userId,
      data,
      systemRoles,
    );
  }

  async generateLiteBracket(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
    reset = false,
  ) {
    return this.tournamentLiteService.generateLiteBracket(
      id,
      userId,
      systemRoles,
      divisionId,
      reset,
    );
  }

  async addLiteClubMember(
    tournamentId: string,
    memberUserId: string,
    actorUserId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLiteService.addLiteClubMember(
      tournamentId,
      memberUserId,
      actorUserId,
      (id, userId, data, inviteCode, actor) =>
        this.register(id, userId, data, inviteCode, actor),
      systemRoles,
    );
  }

  async getLiteParticipants(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLiteService.getLiteParticipants(
      id,
      userId,
      systemRoles,
    );
  }

  async pairLiteParticipants(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    dto: PairLiteParticipantsDto,
  ) {
    return this.tournamentLiteService.pairLiteParticipants(
      id,
      userId,
      systemRoles,
      dto,
    );
  }

  async generateLitePairs(
    id: string,
    userId: string,
    systemRoles: string[] = [],
    dto: GenerateLitePairsDto,
  ) {
    return this.tournamentLiteService.generateLitePairs(
      id,
      userId,
      systemRoles,
      dto,
    );
  }

  async unpairLiteParticipant(
    id: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLiteService.unpairLiteParticipant(
      id,
      participantId,
      userId,
      systemRoles,
    );
  }
  async confirmRoster(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentFootballRosterService.confirmRoster(
      id,
      userId,
      systemRoles,
    );
  }

  async lockParticipantRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentFootballRosterService.lockParticipantRoster(
      tournamentId,
      participantId,
      userId,
      systemRoles,
    );
  }

  async unlockParticipantRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentFootballRosterService.unlockParticipantRoster(
      tournamentId,
      participantId,
      userId,
      systemRoles,
    );
  }

  async getFootballRosterStatus(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentFootballRosterService.getFootballRosterStatus(
      tournamentId,
      participantId,
      userId,
      systemRoles,
    );
  }

  async respondFootballRoster(
    tournamentId: string,
    participantId: string,
    userId: string,
    action: 'CONFIRM' | 'DECLINE',
  ) {
    return this.tournamentFootballRosterService.respondFootballRoster(
      tournamentId,
      participantId,
      userId,
      action,
    );
  }

  async updateFootballRoster(
    tournamentId: string,
    participantId: string,
    dto: UpdateFootballRosterDto,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentFootballRosterService.updateFootballRoster(
      tournamentId,
      participantId,
      dto,
      userId,
      systemRoles,
    );
  }

  async assignReservedSlot(
    tournamentId: string,
    userEmailOrPhone: string,
    teamName: string,
    userId: string,
    systemRoles: string[] = [],
    partnerEmailOrPhone?: string,
    divisionId?: string,
  ) {
    return this.tournamentFootballRosterService.assignReservedSlot(
      tournamentId,
      userEmailOrPhone,
      teamName,
      userId,
      systemRoles,
      partnerEmailOrPhone,
      divisionId,
    );
  }
  async create(
    userId: string,
    createTournamentDto: CreateTournamentDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.create(
      userId,
      createTournamentDto,
      systemRoles,
    );
  }

  async update(
    id: string,
    userId: string,
    updateTournamentDto: UpdateTournamentDto,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.update(
      id,
      userId,
      updateTournamentDto,
      systemRoles,
    );
  }

  async remove(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentLifecycleService.remove(id, userId, systemRoles);
  }

  async removeParent(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentLifecycleService.removeParent(
      id,
      userId,
      systemRoles,
    );
  }

  async publish(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentLifecycleService.publish(id, userId, systemRoles);
  }

  async lock(id: string, userId: string, systemRoles: string[] = []) {
    return this.tournamentLifecycleService.lock(
      id,
      userId,
      () =>
        this.tournamentBracketService.generateBracket(id, userId, systemRoles),
      systemRoles,
    );
  }

  async getOpsAuditLogs(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    return this.tournamentLifecycleService.getOpsAuditLogs(
      tournamentId,
      userId,
      systemRoles,
      divisionId,
    );
  }

  async cancelTournament(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.cancelTournament(
      id,
      userId,
      systemRoles,
    );
  }

  async toggleRecurringTournament(
    id: string,
    enabled: boolean,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.toggleRecurringTournament(
      id,
      enabled,
      userId,
      systemRoles,
    );
  }

  async deleteRecurringTournament(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    return this.tournamentLifecycleService.deleteRecurringTournament(
      id,
      userId,
      systemRoles,
    );
  }
}
