import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { RegisterTournamentDto } from '../dto/register-tournament.dto';
import { TournamentAccessService } from './tournament-access.service';
import { TournamentRealtimeService } from './tournament-realtime.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { TournamentConfig } from '../interfaces/tournament-config.interface';
import { EloCapViolationException } from '../exceptions/elo-cap-violation.exception';
import * as schema from '../../../database/schema';
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
  buildRegistrationCancelledFullNotification,
  buildRegistrationTimeoutNotification,
} from '../../notifications/notification-builder';
import {
  normalizeGenderRestriction,
  normalizeProfileGender,
} from '../../../common/helpers/gender.helper';
import { validateFootballRosterSelection } from '../utils/football-roster-validation';
import { resolveFootballTeamConfig } from '../utils/football-team-config';
import { mapTournamentFormat } from '../utils/tournament-presentation';
import {
  canOpenRegistrationImmediately,
  isRegistrationDeadlineExpired,
  isRegistrationOpenStatus,
} from '../utils/registration-lifecycle';

type AutoSeedFromElo = (
  tournamentId: string,
  userId: string,
  systemRoles: string[],
  divisionId?: string,
) => Promise<unknown>;

@Injectable()
export class TournamentRegistrationService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
    private readonly tournamentRealtimeService: TournamentRealtimeService,
  ) {}
  private async validateEloLimits(
    tournament: typeof schema.tournaments.$inferSelect,
    userIds: string[],
    options?: {
      division?: {
        matchType?: string | null;
        minElo?: number | null;
        maxElo?: number | null;
      } | null;
    },
  ): Promise<void> {
    const config = tournament.tournamentConfig as TournamentConfig;
    const division = options?.division;

    const minElo =
      division?.minElo !== undefined && division?.minElo !== null
        ? Number(division.minElo)
        : config?.minElo !== undefined && config?.minElo !== null
          ? Number(config.minElo)
          : null;
    const maxElo =
      division?.maxElo !== undefined && division?.maxElo !== null
        ? Number(division.maxElo)
        : config?.maxElo !== undefined && config?.maxElo !== null
          ? Number(config.maxElo)
          : null;
    const maxCombinedElo =
      config?.maxCombinedElo !== undefined && config?.maxCombinedElo !== null
        ? Number(config.maxCombinedElo)
        : null;
    const maxTeammateGap =
      config?.maxTeammateGap !== undefined && config?.maxTeammateGap !== null
        ? Number(config.maxTeammateGap)
        : null;
    const effectiveMatchType =
      division?.matchType || tournament.matchType || 'SINGLES';

    if (
      minElo === null &&
      maxElo === null &&
      maxCombinedElo === null &&
      maxTeammateGap === null
    ) {
      return;
    }

    const elos: number[] = [];
    for (const uId of userIds) {
      const elo = await this.tournamentsRepository.getUserElo(
        uId,
        tournament.categoryId,
        effectiveMatchType,
      );
      elos.push(elo);
    }

    for (let i = 0; i < userIds.length; i++) {
      const elo = elos[i];
      if (minElo !== null && elo < minElo) {
        throw new EloCapViolationException(
          `Điểm ELO của bạn (${elo}) thấp hơn mức tối thiểu cho phép (${minElo}) của giải đấu này.`,
        );
      }
      if (maxElo !== null && elo > maxElo) {
        throw new EloCapViolationException(
          `Điểm ELO của bạn (${elo}) vượt quá giới hạn tối đa cho phép (${maxElo}) của giải đấu này.`,
        );
      }
    }

    if (elos.length === 2) {
      const sumElo = elos[0] + elos[1];
      if (maxCombinedElo !== null && sumElo > maxCombinedElo) {
        throw new EloCapViolationException(
          `Tổng điểm ELO của cả đội (${sumElo}) vượt quá giới hạn tối đa cho phép (${maxCombinedElo}) của giải đấu này.`,
        );
      }

      const gap = Math.abs(elos[0] - elos[1]);
      if (maxTeammateGap !== null && gap > maxTeammateGap) {
        throw new EloCapViolationException(
          `Chênh lệch điểm ELO giữa hai đồng đội (${gap}) vượt quá mức chênh lệch tối đa cho phép (${maxTeammateGap}).`,
        );
      }
    }
  }
  private async validateProfileComplete(
    userId: string,
    options?: { isLite?: boolean },
  ): Promise<void> {
    const profile = await this.tournamentsRepository.findUserProfile(userId);
    if (!profile?.fullName) {
      throw new BadRequestException(
        'Vui lòng cập nhật họ tên trước khi tham gia giải đấu.',
      );
    }
    // Đối với giải Siêu Lite nội bộ CLB: phong trào nhanh gọn, KHÔNG bắt buộc số điện thoại hay giới tính!
    if (options?.isLite) {
      return;
    }
    if (!profile.phoneNumber || !profile.gender) {
      throw new BadRequestException(
        'Vui lòng cập nhật đầy đủ họ tên, số điện thoại và giới tính trước khi đăng ký giải đấu.',
      );
    }
  }
  private normalizeGenderValue(
    value?: string | null,
  ): 'MALE' | 'FEMALE' | null {
    const normalized = normalizeProfileGender(value);
    return normalized === 'MALE' || normalized === 'FEMALE'
      ? normalized
      : null;
  }
  private async validateGenderRestriction(
    division: { genderRestriction?: string | null } | null,
    userIds: Array<string | null | undefined>,
  ): Promise<void> {
    if (!division?.genderRestriction) return;
    const restriction = normalizeGenderRestriction(division.genderRestriction);
    if (!restriction) return;
    const knownUsers = userIds.filter(Boolean) as string[];

    if (restriction === 'MIXED') {
      let male = 0;
      let female = 0;
      let knownGenderCount = 0;
      for (const uid of knownUsers) {
        const profile = await this.tournamentsRepository.findUserProfile(uid);
        const g = this.normalizeGenderValue(profile?.gender);
        if (g === 'MALE') {
          male++;
          knownGenderCount++;
        } else if (g === 'FEMALE') {
          female++;
          knownGenderCount++;
        }
      }
      // Chỉ kiểm tra đủ 1 Nam + 1 Nữ khi cả 2 người trong cặp đã được xác định (knownUsers.length >= 2).
      // Khi leader khởi tạo đội và mời đồng đội sau (knownUsers chỉ có 1 người), không chặn ở bước này!
      if (
        knownUsers.length >= 2 &&
        knownGenderCount === knownUsers.length &&
        (male === 0 || female === 0)
      ) {
        throw new BadRequestException(
          'Division đôi nam nữ yêu cầu đúng 1 nam + 1 nữ.',
        );
      }
      return;
    }

    if (restriction !== 'MALE' && restriction !== 'FEMALE') return;
    for (const uid of knownUsers) {
      const profile = await this.tournamentsRepository.findUserProfile(uid);
      const g = this.normalizeGenderValue(profile?.gender);
      if (g === null) continue;
      if (g !== restriction) {
        throw new BadRequestException(
          restriction === 'MALE'
            ? 'Division này chỉ dành cho Nam.'
            : 'Division này chỉ dành cho Nữ.',
        );
      }
    }
  }
  assertRegistrationAccessible(
    tournament: {
      status?: string | null;
      inviteCode?: string | null;
      registrationStartDate?: Date | string | null;
      registrationEndDate?: Date | string | null;
      isRegistrationLocked?: boolean | null;
    },
    options?: {
      inviteCode?: string;
      allowDraft?: boolean;
    },
  ) {
    const status = tournament.status || '';
    const allowDraft = options?.allowDraft === true;

    if (!isRegistrationOpenStatus(status) && !(allowDraft && status === 'DRAFT')) {
      throw new BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký');
    }

    if (
      !isRegistrationOpenStatus(status) &&
      tournament.registrationStartDate &&
      new Date() < new Date(tournament.registrationStartDate)
    ) {
      throw new BadRequestException('Thời gian đăng ký chưa bắt đầu');
    }

    if (
      tournament.registrationEndDate &&
      new Date() > new Date(tournament.registrationEndDate)
    ) {
      throw new BadRequestException('Hạn đăng ký giải đấu đã kết thúc');
    }

    if (tournament.isRegistrationLocked) {
      throw new BadRequestException(
        'Đăng ký giải đấu đã tạm thời bị khóa bởi Ban tổ chức',
      );
    }
  }
  async register(
    id: string,
    userId: string,
    registerTournamentDto: RegisterTournamentDto,
    inviteCode: string | undefined,
    actorUserId: string | undefined,
    autoSeedFromElo: AutoSeedFromElo,
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const tConfig = (
      typeof tournament.tournamentConfig === 'string'
        ? (() => {
            try {
              return JSON.parse(tournament.tournamentConfig);
            } catch {
              return {};
            }
          })()
        : tournament.tournamentConfig
    ) as Record<string, unknown> | null | undefined;
    const isLite = Boolean(tConfig?.isLite || tConfig?.mode === 'LITE');

    // 1. Kiểm tra tư cách thành viên CLB TRƯỚC HẾT đối với giải nội bộ CLB
    if (
      tournament.communityId &&
      (tournament.tournamentType === 'CLUB' || isLite)
    ) {
      const isInviteMatch = Boolean(
        inviteCode && tournament.inviteCode === inviteCode,
      );
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if ((!member || member.status !== 'JOINED') && !isInviteMatch) {
        throw new ForbiddenException(
          'Giải đấu này chỉ dành cho thành viên của câu lạc bộ.',
        );
      }
    }

    this.assertRegistrationAccessible(tournament, { inviteCode });

    // 2. Chỉ kiểm tra hồ sơ cá nhân khi đã là thành viên CLB hợp lệ (giải Siêu Lite không bắt gender)
    await this.validateProfileComplete(userId, { isLite });

    let userIds = [userId];
    let partnerUser: { id: string } | null = null;
    if (registerTournamentDto.partnerEmailOrPhone) {
      partnerUser = await this.tournamentsRepository.findUserByEmailOrPhone(
        registerTournamentDto.partnerEmailOrPhone,
      );
      if (!partnerUser) {
        throw new BadRequestException(
          `Không tìm thấy tài khoản Sporto với email/SĐT "${registerTournamentDto.partnerEmailOrPhone}". Đồng đội cần đăng ký tài khoản trước khi tham gia.`,
        );
      }
      userIds.push(partnerUser.id);
    }

    const requestedDivisionId =
      registerTournamentDto.tournamentDivisionId ??
      registerTournamentDto.divisionId;
    const requestedDivision = requestedDivisionId
      ? await this.tournamentsRepository.findDivisionById(requestedDivisionId)
      : null;

    const registrationMatchType =
      requestedDivision?.matchType ?? tournament.matchType;
    const isDoublesRegistration =
      registrationMatchType === 'DOUBLES' ||
      registrationMatchType === 'MIXED_DOUBLES';
    const configuredDoublesPairingMode =
      ((tournament.tournamentConfig || {}) as Record<string, unknown>)
        .doublesPairingMode === 'SELF'
        ? 'SELF'
        : 'ORGANIZER';
    const requestedDoublesPairingMode =
      registerTournamentDto.doublesPairingMode === 'SELF' ||
      registerTournamentDto.doublesPairingMode === 'ORGANIZER'
        ? registerTournamentDto.doublesPairingMode
        : configuredDoublesPairingMode;

    const isOrganizerPairing =
      isDoublesRegistration && requestedDoublesPairingMode === 'ORGANIZER';

    if (
      !isDoublesRegistration &&
      !isOrganizerPairing &&
      !registerTournamentDto.teamName?.trim() &&
      !registerTournamentDto.footballTeamId
    ) {
      throw new BadRequestException('Vui lòng nhập tên đội hoặc tên thi đấu.');
    }

    if (
      isDoublesRegistration &&
      requestedDoublesPairingMode === 'ORGANIZER' &&
      registerTournamentDto.partnerEmailOrPhone
    ) {
      throw new BadRequestException(
        'Nội dung này do BTC ghép đôi. Vui lòng đăng ký cá nhân.',
      );
    }

    const tournamentConfig = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const footballTeamConfig = resolveFootballTeamConfig(tournamentConfig);
    const isFootballTeamTournament = footballTeamConfig.isTeamSport;
    let footballTeam: Awaited<
      ReturnType<TournamentsRepository['findFootballTeamForRegistration']>
    > = null;
    if (isFootballTeamTournament) {
      if (registerTournamentDto.partnerEmailOrPhone) {
        throw new BadRequestException(
          'Giải bóng đá dùng đội đã tạo, không ghép đồng đội bằng email.',
        );
      }
      if (!registerTournamentDto.footballTeamId) {
        throw new BadRequestException(
          'Vui lòng chọn đội bóng trước khi đăng ký.',
        );
      }
      footballTeam =
        await this.tournamentsRepository.findFootballTeamForRegistration(
          registerTournamentDto.footballTeamId,
          userId,
        );
      if (!footballTeam || footballTeam.status !== 'ACTIVE') {
        throw new ForbiddenException(
          'Bạn không có quyền đăng ký bằng đội bóng này.',
        );
      }
      if (!['CAPTAIN', 'MANAGER'].includes(footballTeam.membership.role)) {
        throw new ForbiddenException(
          'Chỉ đội trưởng hoặc quản lý mới được đăng ký đội bóng.',
        );
      }
      if (footballTeam.categoryId !== tournament.categoryId) {
        throw new BadRequestException(
          'Đội bóng không cùng môn thể thao với giải đấu.',
        );
      }
      const selectedTeamSize = footballTeamConfig.mainSize;
      const maxReserve = footballTeamConfig.maxReserve;
      const maxTeamSize = footballTeamConfig.maxTotalSize;
      const roster = validateFootballRosterSelection({
        leaderId: userId,
        memberIds: registerTournamentDto.memberIds?.length
          ? registerTournamentDto.memberIds
          : footballTeam.members.map((member) => member.userId),
        reserveMemberIds: registerTournamentDto.reserveMemberIds ?? [],
        activeMemberIds: new Set(
          footballTeam.members.map((member) => member.userId),
        ),
        // Registration may be saved as a draft with only the captain.
        // The configured team size is enforced by the roster lock gate.
        minMainSize: 1,
        maxMainSize: selectedTeamSize,
        maxReserve,
        maxTotalSize: maxTeamSize,
      });
      userIds = roster.allMemberIds;
    }

    await this.validateEloLimits(tournament, userIds, {
      division: requestedDivision,
    });
    // Khi mời partner ngay: chặn đội vi phạm genderRestriction của division
    await this.validateGenderRestriction(requestedDivision, userIds);

    const result = await this.tournamentsRepository.registerParticipant(
      id,
      userId,
      registerTournamentDto,
      inviteCode,
    );

    if (footballTeam && result.participant.tournamentDivisionId) {
      const selectedMemberIds = [
        ...new Set([
          ...(registerTournamentDto.memberIds?.length
            ? registerTournamentDto.memberIds
            : footballTeam.members.map((member) => member.userId)),
          ...(registerTournamentDto.reserveMemberIds ?? []),
        ]),
      ].filter((memberId) => memberId !== userId);
      try {
        await Promise.all(selectedMemberIds.map((receiverId) =>
          this.notificationsService.sendNotification(
            buildFootballRosterConfirmationNotification({
              receiverId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId:
                result.participant.tournamentDivisionId ?? undefined,
              participantId: result.participant.id,
            }),
          ),
        ));
      } catch (error) {
        console.error(
          'Failed to send football roster confirmation notifications:',
          error,
        );
      }
    }

    try {
      const canceledLeaders =
        await this.tournamentsRepository.cancelPendingRegistrationsIfFull(id);
      for (const canceledLeader of canceledLeaders) {
        await this.notificationsService.sendNotification(
          buildRegistrationCancelledFullNotification({
            receiverId: canceledLeader.leaderId,
            tournamentId: id,
            divisionId: canceledLeader.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    try {
      const notifications: Array<Promise<unknown>> = [];

      if (tournament.createdBy !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildOrganizerNewRegistrationNotification({
              receiverId: tournament.createdBy,
              tournamentId: id,
              tournamentName: tournament.name,
              teamName: result.participant.teamName,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      if (result.participant.teamStatus === 'PENDING_PARTNER' && partnerUser) {
        // VĐV 1 đã nhập email/SĐT VĐV 2 — gửi thông báo mời cho VĐV 2
        notifications.push(
          this.notificationsService.sendNotification(
            buildPartnerInviteReceivedNotification({
              tournamentId: id,
              tournamentName: tournament.name,
              receiverId: partnerUser.id,
              senderId: userId,
              teamName: result.participant.teamName,
              participantId: result.participant.id,
            }),
          ),
        );
      } else if (result.teamInviteLink) {
        // VĐV 1 chưa có partner (chọn mời sau qua link/QR) — thông báo cho VĐV 1 chờ đồng đội join
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantPendingTeammateNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      } else if (result.participant.teamStatus === 'PENDING_APPROVAL') {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantRegistrationPendingNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      } else if (
        result.participant.teamStatus === 'COMPLETE' &&
        result.participant.isPaid
      ) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantRegistrationSuccessNotification({
              receiverId: userId,
              tournamentId: id,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      await Promise.all(notifications);
    } catch (err) {
      console.error('Failed to send registration notifications:', err);
    }

    // Auto seed by ELO if configured
    try {
      const config = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      if (config.seedingMethod === 'ELO') {
        const divisionId = result.participant.tournamentDivisionId;
        await autoSeedFromElo(
          id,
          actorUserId ?? userId,
          [],
          divisionId ?? undefined,
        );
      }
    } catch (err) {
      console.error('Failed to auto-seed after registration:', err);
    }

    this.tournamentRealtimeService.broadcastRegistrationChanged(id, {
      participantId: result.participant.id,
      divisionId: result.participant.tournamentDivisionId,
      action: 'REGISTERED',
    });

    return result;
  }
  async joinTeam(
    tournamentId: string,
    userId: string,
    participantId: string,
    teamInviteToken: string,
  ) {
    // Đồng đội cũng phải có hồ sơ đầy đủ trước khi join team
    await this.validateProfileComplete(userId);

    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    this.assertRegistrationAccessible(tournament, { allowDraft: true });

    // Nếu là giải nội bộ CLB, chỉ member mới join team được
    if (tournament.communityId && tournament.tournamentType === 'CLUB') {
      const member = await this.tournamentsRepository.findCommunityMember(
        tournament.communityId,
        userId,
      );
      if (!member || member.status !== 'JOINED') {
        throw new ForbiddenException(
          'Giải đấu này chỉ dành cho thành viên của câu lạc bộ.',
        );
      }
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    // The participant owner is the canonical leader. Do not infer the leader
    // from the first MAIN roster: legacy data can contain more than one MAIN
    // row after a previous pairing/unpairing flow.
    const leaderUserId = participant?.registeredBy ?? null;
    const userIds = [leaderUserId, userId].filter(
      (value): value is string => Boolean(value),
    );
    if (participant?.rosterLockedAt) {
      throw new BadRequestException(
        'Roster đội đã được khóa, không thể thêm thành viên.',
      );
    }
    const division = participant?.tournamentDivisionId
      ? await this.tournamentsRepository.findDivisionById(
          participant.tournamentDivisionId,
        )
      : null;

    await this.validateEloLimits(tournament, userIds, { division });
    // Gender validation runs once inside the join transaction using the
    // locked participant and its canonical registeredBy leader. This avoids
    // two sources of truth for legacy rosters.

    const result = await this.tournamentsRepository.joinTeam(
      tournamentId,
      userId,
      participantId,
      teamInviteToken,
    );

    try {
      const canceledLeaders =
        await this.tournamentsRepository.cancelPendingRegistrationsIfFull(
          tournamentId,
        );
      for (const canceledLeader of canceledLeaders) {
        await this.notificationsService.sendNotification(
          buildRegistrationCancelledFullNotification({
            receiverId: canceledLeader.leaderId,
            tournamentId,
            divisionId: canceledLeader.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to cancel pending registrations on full:', err);
    }

    try {
      const participantRosters =
        await this.tournamentsRepository.getParticipantRosters(
          result.participant.id,
        );
      const notifications: Array<Promise<unknown>> = [];

      if (leaderUserId && leaderUserId !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildParticipantTeammateJoinedNotification({
              receiverId: leaderUserId,
              tournamentId,
              tournamentName: tournament.name,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      if (tournament.createdBy !== userId) {
        notifications.push(
          this.notificationsService.sendNotification(
            buildOrganizerTeamCompletedNotification({
              receiverId: tournament.createdBy,
              tournamentId,
              tournamentName: tournament.name,
              teamName: result.participant.teamName,
              divisionId: result.participant.tournamentDivisionId,
            }),
          ),
        );
      }

      for (const roster of participantRosters) {
        if (result.participant.teamStatus === 'PENDING_APPROVAL') {
          notifications.push(
            this.notificationsService.sendNotification(
              buildParticipantRegistrationPendingNotification({
                receiverId: roster.userId,
                tournamentId,
                tournamentName: tournament.name,
                divisionId: result.participant.tournamentDivisionId,
              }),
            ),
          );
        } else if (
          result.participant.teamStatus === 'COMPLETE' &&
          result.participant.isPaid
        ) {
          notifications.push(
            this.notificationsService.sendNotification(
              buildParticipantRegistrationSuccessNotification({
                receiverId: roster.userId,
                tournamentId,
                tournamentName: tournament.name,
                divisionId: result.participant.tournamentDivisionId,
              }),
            ),
          );
        }
      }

      await Promise.all(notifications);
    } catch (err) {
      console.error('Failed to send joinTeam notifications:', err);
    }

    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId: result.participant.id,
      divisionId: result.participant.tournamentDivisionId,
      action: 'TEAM_JOINED',
    });

    return result;
  }
  async addTeamMember(
    participantId: string,
    userId: string,
    memberUserId: string,
    role: 'MAIN' | 'RESERVE',
  ) {
    if (!memberUserId) {
      throw new BadRequestException('Thiếu ID thành viên cần mời.');
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant) throw new NotFoundException('Đội thi đấu không tồn tại.');

    const tournament = await this.tournamentsRepository.findById(
      participant.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    // Chỉ đội trưởng (người tạo) mới được mời
    if (participant.registeredBy !== userId) {
      throw new ForbiddenException('Chỉ đội trưởng mới được mời thành viên.');
    }

    if (
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException('Giải đấu không trong thời gian đăng ký.');
    }

    if (participant.rosterLockedAt) {
      throw new BadRequestException(
        'Roster đội đã được khóa, không thể thêm thành viên.',
      );
    }

    // Chặn mời chính mình
    if (memberUserId === userId) {
      throw new BadRequestException('Bạn đã là đội trưởng của đội.');
    }

    // Giới hạn maxTeamSize
    const config = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    const maxTeamSize = resolveFootballTeamConfig(config).maxTotalSize;
    if (Number.isFinite(maxTeamSize) && maxTeamSize > 0) {
      const rosters =
        await this.tournamentsRepository.getParticipantRosters(participantId);
      if (rosters.length >= maxTeamSize) {
        throw new BadRequestException('Đội đã đạt số thành viên tối đa.');
      }
    }

    // Chống trùng
    const existing =
      await this.tournamentsRepository.getParticipantRosters(participantId);
    if (existing.some((r) => r.userId === memberUserId)) {
      throw new BadRequestException('Thành viên này đã ở trong đội.');
    }

    const result = await this.tournamentsRepository.addRoster(
      participantId,
      memberUserId,
      role,
      maxTeamSize,
    );
    this.tournamentRealtimeService.broadcastRegistrationChanged(participant.tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_UPDATED',
    });
    return result;
  }
  async removeTeamMember(
    participantId: string,
    userId: string,
    memberUserId: string,
  ) {
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant) throw new NotFoundException('Đội thi đấu không tồn tại.');

    // Chỉ đội trưởng xoá được (không xoá chính đội trưởng)
    if (participant.registeredBy !== userId) {
      throw new ForbiddenException('Chỉ đội trưởng mới được xoá thành viên.');
    }
    if (memberUserId === userId) {
      throw new BadRequestException(
        'Không thể tự xoá đội trưởng. Hãy rút đội.',
      );
    }

    if (participant.rosterLockedAt) {
      throw new BadRequestException(
        'Roster đội đã được khóa, không thể xóa thành viên.',
      );
    }

    const result = await this.tournamentsRepository.removeRoster(
      participantId,
      memberUserId,
    );
    this.tournamentRealtimeService.broadcastRegistrationChanged(participant.tournamentId, {
      participantId,
      divisionId: participant.tournamentDivisionId,
      action: 'ROSTER_UPDATED',
    });
    return result;
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
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const now = new Date();
    if (['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(tournament.status)) {
      throw new BadRequestException(
        'Giải đấu đã bắt đầu hoặc kết thúc, không thể tự rút lui.',
      );
    }
    if (
      tournament.registrationEndDate &&
      now > new Date(tournament.registrationEndDate) &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException('Đã quá thời hạn rút lui của giải đấu.');
    }

    const currentRegistration = await this.tournamentsRepository.myRegistration(
      tournamentId,
      userId,
      divisionId,
    );
    const result = await this.tournamentsRepository.withdraw(
      tournamentId,
      userId,
      bankData,
      divisionId,
    );

    try {
      if (
        tournament.createdBy !== userId &&
        currentRegistration.registered &&
        currentRegistration.participant
      ) {
        await this.notificationsService.sendNotification(
          buildParticipantWithdrawnNotification({
            receiverId: tournament.createdBy,
            tournamentId,
            tournamentName: tournament.name,
            teamName: currentRegistration.participant.teamName,
          }),
        );
      }

      // Nếu còn lời mời ghép đôi chưa xử lý — báo cho người được mời là lời mời đã bị thu hồi
      if (
        currentRegistration.registered &&
        currentRegistration.participant &&
        currentRegistration.participant.teamStatus === 'PENDING_PARTNER' &&
        currentRegistration.participant.partnerUserId
      ) {
        await this.notificationsService.sendNotification(
          buildPartnerInviteCancelledNotification({
            receiverId: currentRegistration.participant.partnerUserId,
            tournamentId,
            divisionId: currentRegistration.participant.tournamentDivisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send withdraw notification:', err);
    }

    if (currentRegistration.participant) {
      this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
        participantId: currentRegistration.participant.id,
        divisionId: currentRegistration.participant.tournamentDivisionId,
        action: 'WITHDRAWN',
      });
    }

    return result;
  }
  async myRegistration(
    tournamentId: string,
    userId: string,
    divisionId?: string,
  ) {
    return this.tournamentsRepository.myRegistration(
      tournamentId,
      userId,
      divisionId,
    );
  }
  async findByInviteCode(inviteCode: string) {
    const tournament =
      await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    this.assertInviteReachable(tournament);
    return mapTournamentFormat(tournament);
  }
  async joinByInviteCode(
    inviteCode: string,
    userId: string,
    registerTournamentDto: RegisterTournamentDto,
    autoSeedFromElo: AutoSeedFromElo,
  ) {
    const tournament =
      await this.tournamentsRepository.findByInviteCode(inviteCode);
    if (!tournament) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    this.assertInviteReachable(tournament);

    return this.register(
      tournament.id,
      userId,
      registerTournamentDto,
      inviteCode,
      undefined,
      autoSeedFromElo,
    );
  }
  private assertInviteReachable(tournament: { status?: string | null }) {
    const status = tournament.status || '';
    if (['DRAFT', 'PENDING_APPROVAL', 'PENDING_DELETE'].includes(status)) {
      throw new NotFoundException('Không tìm thấy giải đấu cho mã mời này');
    }
    if (status === 'SUSPENDED') {
      throw new ForbiddenException(
        'Giải đấu đang bị tạm đình chỉ do vi phạm điều khoản dịch vụ',
      );
    }
    if (status === 'CANCELLED') {
      throw new ForbiddenException('Giải đấu đã bị cấm hoặc hủy vĩnh viễn');
    }
  }
  async reopenRegistration(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền mở lại đăng ký');
    }

    if (
      !canOpenRegistrationImmediately(tournament.status)
    ) {
      throw new BadRequestException(
        'Chỉ có thể mở đăng ký ngay từ trạng thái Sắp diễn ra hoặc Đã khóa đăng ký.',
      );
    }
    const now = new Date();
    if (tournament.startDate && new Date(tournament.startDate) <= now) {
      throw new BadRequestException(
        'Không thể mở lại đăng ký sau thời điểm giải bắt đầu.',
      );
    }
    if (isRegistrationDeadlineExpired(tournament.registrationEndDate, now)) {
      throw new BadRequestException(
        'Hạn đăng ký đã kết thúc. Hãy cập nhật hạn đăng ký trước khi mở lại.',
      );
    }

    const bracket = await this.tournamentsRepository.findBracket(id);
    if (bracket?.stages?.length) {
      throw new BadRequestException(
        'Không thể mở lại đăng ký sau khi sơ đồ thi đấu đã được tạo. Hãy xử lý lại sơ đồ theo quy trình riêng để tránh kết quả cũ bị lệch.',
      );
    }

    const updated = await this.tournamentsRepository.reopenRegistration(
      id,
      now,
    );
    if (!updated) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    return mapTournamentFormat(updated);
  }
  async regenerateInviteCode(
    id: string,
    userId: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }

    // Check authorization: Admin or Creator
    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền tạo lại mã mời');
    }
    if (
      tournament.status === 'REGISTRATION_CLOSED' ||
      tournament.isRegistrationLocked
    ) {
      throw new BadRequestException(
        'Đăng ký đã được khóa. Không thể tạo mã mời mới ở giai đoạn này.',
      );
    }

    const updated = await this.tournamentsRepository.regenerateInviteCode(
      id,
      userId,
    );
    return mapTournamentFormat(updated);
  }
  async validateInvite(id: string, inviteCode: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament || tournament.inviteCode !== inviteCode) {
      throw new BadRequestException('Mã mời không hợp lệ');
    }
    return {
      id: tournament.id,
      name: tournament.name,
      startDate: tournament.startDate,
      entryFee: tournament.entryFee,
      matchType: tournament.matchType,
      genderRestriction: tournament.genderRestriction,
    };
  }
  async kickParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    reason?: string,
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
      if (member && (member.role === 'OWNER' || member.role === 'MODERATOR')) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền loại người tham gia này',
      );
    }

    const rosters =
      await this.tournamentsRepository.getParticipantRosters(participantId);
    const result = await this.tournamentsRepository.kickParticipant(
      tournamentId,
      participantId,
      userId,
    );

    try {
      for (const roster of rosters) {
        await this.notificationsService.sendNotification(
          buildParticipantKickedNotification({
            receiverId: roster.userId,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            reason,
          }),
        );
      }
    } catch (err) {
      console.error('Failed to send notification for kickParticipant:', err);
    }

    this.tournamentRealtimeService.broadcastRegistrationChanged(tournamentId, {
      participantId,
      action: 'PARTICIPANT_REMOVED',
    });

    return result;
  }
  async acceptPartnerInvite(participantId: string, partnerUserId: string) {
    // Đồng ý ghép đôi qua thông báo → vẫn phải chặn vi phạm giới tính
    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (participant) {
      const division = participant.tournamentDivisionId
        ? await this.tournamentsRepository.findDivisionById(
            participant.tournamentDivisionId,
          )
        : null;
      const leaderRoster =
        await this.tournamentsRepository.findLeaderByParticipantId(
          participantId,
        );
      await this.validateGenderRestriction(division, [
        leaderRoster?.userId,
        partnerUserId,
      ]);
    }

    const updated = await this.tournamentsRepository.acceptPartnerInvite(
      participantId,
      partnerUserId,
    );
    if (updated && updated.registeredBy) {
      await this.notificationsService.sendNotification(
        buildPartnerInviteAcceptedNotification({
          receiverId: updated.registeredBy,
          tournamentId: updated.tournamentId,
          divisionId: updated.tournamentDivisionId,
        }),
      );
    }
    if (updated) {
      this.tournamentRealtimeService.broadcastRegistrationChanged(updated.tournamentId, {
        participantId: updated.id,
        divisionId: updated.tournamentDivisionId,
        action: 'PARTNER_ACCEPTED',
      });
    }
    return updated;
  }
  async rejectPartnerInvite(participantId: string, partnerUserId: string) {
    const updated = await this.tournamentsRepository.rejectPartnerInvite(
      participantId,
      partnerUserId,
    );
    if (updated && updated.registeredBy) {
      await this.notificationsService.sendNotification(
        buildPartnerInviteRejectedNotification({
          receiverId: updated.registeredBy,
          tournamentId: updated.tournamentId,
          divisionId: updated.tournamentDivisionId,
        }),
      );
    }
    return updated;
  }
  async processPendingRegistrationTimeout() {
    try {
      const expiredList =
        await this.tournamentsRepository.processPendingRegistrationsTimeout();
      for (const item of expiredList) {
        await this.notificationsService.sendNotification(
          buildRegistrationTimeoutNotification({
            receiverId: item.leaderId,
            tournamentId: item.tournamentId,
            tournamentName: item.tournamentName,
            divisionId: item.divisionId,
          }),
        );
      }
    } catch (err) {
      console.error('Error handling registrations timeout cron:', err);
    }
  }
}
