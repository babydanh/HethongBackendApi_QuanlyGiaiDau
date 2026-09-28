import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb, AppDbOrTx } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { PaymentStatus } from '../../../common/constants/enums';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  ne,
  notExists,
  notInArray,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { AuditService, Transaction } from '../../audit/audit.service';
import { RegisterTournamentDto } from '../dto/register-tournament.dto';
import { RosterMember } from '../interfaces/tournament-config.interface';
import { ExclusionRuleException } from '../../series/exceptions/exclusion-rule.exception';
import { CursorPaginationHelper } from '../../../common/helpers/cursor-pagination.helper';
import {
  normalizeGenderRestriction,
  normalizeProfileGender,
} from '../../../common/helpers/gender.helper';
import {
  resolveLoserTargetSlot,
  resolveWinnerTargetSlot,
} from '../../../common/helpers/bracket-advancement.helper';
import {
  isLiteRegistrationTournament,
  isRegistrationFeePaid,
  isRegistrationRosterCompleteForPayment,
} from '../utils/registration-payment-eligibility';
import { isRegistrationOpenStatus } from '../utils/registration-lifecycle';
import {
  resolveDoublesParticipantStatus,
  resolveNonDoublesParticipantStatus,
} from '../utils/tournament-participant-status';
import { validateFootballRosterSelection } from '../utils/football-roster-validation';
import { calculateTournamentRefundQuote } from '../utils/tournament-refund-policy';
import {
  getRequiredFootballMainRosterCount,
  resolveFootballTeamConfig,
} from '../utils/football-team-config';
import { TournamentPaymentRepository } from './tournament-payment.repository';

@Injectable()
export class TournamentRegistrationRepository {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}
  private normalizeGender(
    value: string | null | undefined,
  ): 'MALE' | 'FEMALE' | null {
    const normalized = normalizeProfileGender(value);
    return normalized === 'MALE' || normalized === 'FEMALE' ? normalized : null;
  }
  private isDoublesMatchType(matchType: string | null | undefined) {
    return matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES';
  }
  async reopenRegistration(id: string, registrationStartDate?: Date) {
    const [updated] = await this.db
      .update(schema.tournaments)
      .set({
        status: 'REGISTRATION_OPEN',
        isRegistrationLocked: false,
        ...(registrationStartDate ? { registrationStartDate } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.tournaments.id, id))
      .returning();
    return updated;
  }
  async registerParticipant(
    tournamentId: string,
    userId: string,
    data: RegisterTournamentDto,
    inviteCode?: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .for('update')
        .limit(1);

      if (!tournament) {
        throw new BadRequestException('Giải đấu không tồn tại');
      }

      if (tournament.isRanked && data.rankingConsent !== true) {
        throw new BadRequestException(
          'Giải đấu có xếp hạng yêu cầu bạn đồng ý gửi kết quả lên bảng xếp hạng.',
        );
      }

      // 1.5 Kiểm tra Exclusion Rule (khóa đăng ký đối với chặng đấu thuộc chuỗi giải đấu)
      const [seriesEvent] = await tx
        .select({
          event: schema.seriesEvents,
          leg: schema.seriesLegs,
          series: schema.tournamentSeries,
        })
        .from(schema.seriesEvents)
        .innerJoin(
          schema.seriesLegs,
          eq(schema.seriesEvents.legId, schema.seriesLegs.id),
        )
        .innerJoin(
          schema.tournamentSeries,
          eq(schema.seriesLegs.seriesId, schema.tournamentSeries.id),
        )
        .where(eq(schema.seriesEvents.tournamentId, tournamentId))
        .limit(1);

      if (seriesEvent && seriesEvent.series.rules) {
        const rules = seriesEvent.series.rules as unknown as {
          exclusionRule?: boolean;
          exclusionScope?: 'CATEGORY' | 'ALL';
        };
        if (rules.exclusionRule) {
          const scope = rules.exclusionScope || 'CATEGORY';
          const conds = [
            eq(schema.seriesStandings.legId, seriesEvent.leg.id),
            eq(schema.seriesStandings.userId, userId),
            eq(schema.seriesStandings.lockedOut, true),
          ];
          if (scope === 'CATEGORY') {
            conds.push(
              eq(schema.seriesStandings.categoryId, tournament.categoryId),
            );
          }
          const [standing] = await tx
            .select()
            .from(schema.seriesStandings)
            .where(and(...conds))
            .limit(1);

          if (standing) {
            throw new ExclusionRuleException(
              `Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được đăng ký tiếp nội dung ${
                scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'
              }.`,
            );
          }
        }
      }

      // The lifecycle status is the registration gate. UPCOMING is scheduled,
      // not open; the organizer action moves it to REGISTRATION_OPEN.
      if (
        !isRegistrationOpenStatus(tournament.status) ||
        tournament.isRegistrationLocked
      ) {
        throw new BadRequestException('Giải đấu chưa hoặc đã đóng đăng ký.');
      }

      // 3. Kiểm tra thời hạn đăng ký; the status gate above has already
      // rejected UPCOMING, so the configured start date cannot override it.
      const now = new Date();
      if (
        tournament.registrationEndDate &&
        now > tournament.registrationEndDate
      ) {
        throw new BadRequestException('Thời gian đăng ký đã kết thúc.');
      }

      // 4. Kiểm tra mã mời nếu giải PRIVATE hoặc ở chế độ INVITE_ONLY
      const tConfig = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const configuredDoublesPairingMode =
        tConfig.doublesPairingMode === 'SELF' ? 'SELF' : 'ORGANIZER';
      const requestedDoublesPairingMode =
        data.doublesPairingMode === 'SELF' ||
        data.doublesPairingMode === 'ORGANIZER'
          ? data.doublesPairingMode
          : configuredDoublesPairingMode;
      const rawRegMode = (tConfig.registrationMode as string) || 'OPEN';
      const regMode = rawRegMode;

      if (regMode === 'INVITE_ONLY' || tournament.visibility === 'PRIVATE') {
        if (!inviteCode || tournament.inviteCode !== inviteCode) {
          throw new BadRequestException(
            'Mã mời giải đấu không hợp lệ hoặc thiếu.',
          );
        }
      }

      const getProfileGender = async (targetUserId: string, label: string) => {
        const [profile] = await tx
          .select({ gender: schema.profiles.gender })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, targetUserId))
          .limit(1);

        const rawGender = (profile?.gender || '').trim().toUpperCase();
        let gender = rawGender;
        if (rawGender === 'NAM' || rawGender === 'MALE') gender = 'MALE';
        else if (
          rawGender === 'NỮ' ||
          rawGender === 'NU' ||
          rawGender === 'FEMALE'
        )
          gender = 'FEMALE';

        if (gender !== 'MALE' && gender !== 'FEMALE') {
          throw new BadRequestException(
            `${label} cần cập nhật giới tính trong hồ sơ cá nhân để đăng ký.`,
          );
        }
        return gender;
      };

      const normalizeMatchType = (matchType: string | null) => {
        if (
          matchType === 'SINGLES' ||
          matchType === 'DOUBLES' ||
          matchType === 'MIXED_DOUBLES'
        ) {
          return matchType;
        }
        return 'DOUBLES';
      };

      type ResolvedDivisionResult = {
        division: typeof schema.tournamentDivisions.$inferSelect;
        isWaitlisted: boolean;
      };

      const resolveMatchingDivision = async (
        partnerUserId: string | null,
      ): Promise<ResolvedDivisionResult | null> => {
        const divisions = await tx
          .select()
          .from(schema.tournamentDivisions)
          .where(
            and(
              eq(schema.tournamentDivisions.tournamentId, tournamentId),
              ne(schema.tournamentDivisions.status, 'CANCELLED'),
            ),
          );

        const requestedDivisionId =
          data.tournamentDivisionId ?? data.divisionId;
        const requestedDivision = requestedDivisionId
          ? divisions.find((division) => division.id === requestedDivisionId)
          : undefined;
        const requestedGenderRestriction = (
          requestedDivision?.genderRestriction || ''
        ).toUpperCase();

        const isLiteTournament = Boolean(
          tConfig.isLite || tConfig.mode === 'LITE',
        );
        const isExplicitOpenDivision = Boolean(
          isLiteTournament ||
          (requestedDivisionId &&
            requestedDivision &&
            !['MALE', 'FEMALE', 'MIXED'].includes(requestedGenderRestriction)),
        );
        const requiresLeaderGender =
          !isExplicitOpenDivision &&
          (Boolean(partnerUserId) ||
            !requestedDivisionId ||
            (requestedGenderRestriction !== '' &&
              requestedGenderRestriction !== 'OPEN'));
        const leaderGender = requiresLeaderGender
          ? await getProfileGender(userId, 'Bạn')
          : null;
        let targetMatchType = normalizeMatchType(tournament.matchType);
        let targetGenderRestriction: 'MALE' | 'FEMALE' | 'MIXED' =
          leaderGender === 'MALE' ? 'MALE' : 'FEMALE';

        if (partnerUserId && !isExplicitOpenDivision) {
          const partnerGender = await getProfileGender(
            partnerUserId,
            'Đồng đội',
          );
          targetGenderRestriction =
            leaderGender === partnerGender ? leaderGender : 'MIXED';
          targetMatchType =
            targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
        } else if (
          !partnerUserId &&
          targetMatchType === 'MIXED_DOUBLES' &&
          !requestedDivisionId &&
          !isLiteTournament &&
          requestedDoublesPairingMode === 'SELF'
        ) {
          throw new BadRequestException(
            'Hình thức Đôi Nam Nữ yêu cầu nhập đồng đội để xác định giới tính cặp.',
          );
        }

        if (requestedDivisionId) {
          if (requestedDivision) {
            targetMatchType = normalizeMatchType(requestedDivision.matchType);
            const reqGender = requestedGenderRestriction;
            if (
              reqGender === 'MALE' ||
              reqGender === 'FEMALE' ||
              reqGender === 'MIXED'
            ) {
              targetGenderRestriction = reqGender;
            }
          }
        }

        if (tournament.genderRestriction && !requestedDivisionId) {
          const restriction = tournament.genderRestriction.toUpperCase();
          if (restriction === 'MALE' && targetGenderRestriction !== 'MALE') {
            throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
          }
          if (
            restriction === 'FEMALE' &&
            targetGenderRestriction !== 'FEMALE'
          ) {
            throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
          }
          if (restriction === 'MIXED' && targetGenderRestriction !== 'MIXED') {
            throw new BadRequestException(
              'Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.',
            );
          }
        }

        const selectedDivision = requestedDivisionId
          ? divisions.find((division) => division.id === requestedDivisionId)
          : isLiteTournament
            ? divisions.find(
                (division) =>
                  division.matchType === targetMatchType ||
                  !division.genderRestriction ||
                  division.genderRestriction.toUpperCase() === 'OPEN',
              ) || divisions[0]
            : divisions.find(
                (division) =>
                  division.matchType === targetMatchType &&
                  (division.genderRestriction === targetGenderRestriction ||
                    !division.genderRestriction ||
                    division.genderRestriction.toUpperCase() === 'OPEN'),
              );

        if (!selectedDivision) {
          const fallbackLabel =
            targetGenderRestriction === 'MIXED'
              ? 'Đôi Nam Nữ'
              : targetMatchType === 'SINGLES'
                ? targetGenderRestriction === 'MALE'
                  ? 'Đơn Nam'
                  : 'Đơn Nữ'
                : targetGenderRestriction === 'MALE'
                  ? 'Đôi Nam'
                  : 'Đôi Nữ';
          throw new BadRequestException(
            `Không có hình thức thi đấu ${fallbackLabel} phù hợp cho giải này.`,
          );
        }

        const divGender = (
          selectedDivision.genderRestriction || ''
        ).toUpperCase();
        if (divGender === 'MALE' && leaderGender && leaderGender !== 'MALE') {
          throw new BadRequestException(
            'Hình thức thi đấu đã chọn chỉ dành cho VĐV Nam.',
          );
        }
        if (
          divGender === 'FEMALE' &&
          leaderGender &&
          leaderGender !== 'FEMALE'
        ) {
          throw new BadRequestException(
            'Hình thức thi đấu đã chọn chỉ dành cho VĐV Nữ.',
          );
        }

        if (selectedDivision.maxParticipants) {
          const [participantCount] = await tx
            .select({ count: count() })
            .from(schema.tournamentParticipants)
            .where(
              and(
                eq(
                  schema.tournamentParticipants.tournamentDivisionId,
                  selectedDivision.id,
                ),
                eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                eq(schema.tournamentParticipants.isPaid, true),
              ),
            );

          if (participantCount.count >= selectedDivision.maxParticipants) {
            return { division: selectedDivision, isWaitlisted: true };
          }
        }

        return { division: selectedDivision, isWaitlisted: false };
      };

      // 6. CLUB check: user must be community member
      const isLiteTournament = Boolean(
        tConfig.isLite || tConfig.mode === 'LITE',
      );
      if (
        (tournament.tournamentType === 'CLUB' || isLiteTournament) &&
        tournament.communityId
      ) {
        const member = await tx
          .select()
          .from(schema.communityMembers)
          .where(
            and(
              eq(schema.communityMembers.communityId, tournament.communityId),
              eq(schema.communityMembers.userId, userId),
              eq(schema.communityMembers.status, 'JOINED'),
            ),
          )
          .limit(1);
        if (member.length === 0) {
          throw new BadRequestException(
            'Chỉ thành viên CLB mới được đăng ký giải đấu này.',
          );
        }
      }

      // 8. Kiểm tra xem người đăng ký đã có trong giải đấu này chưa (chống trùng)
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(
          schema.tournamentParticipants,
          eq(
            schema.tournamentRosters.participantId,
            schema.tournamentParticipants.id,
          ),
        )
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
            ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
          ),
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException(
          'Bạn đã đăng ký tham gia giải đấu này rồi.',
        );
      }

      // 9. Thêm participant
      const tournamentIsDoubles = this.isDoublesMatchType(tournament.matchType);

      let partnerId: string | null = null;
      if (tournamentIsDoubles && data.partnerEmailOrPhone) {
        // Resolve partner account
        const [partnerUser] = await tx
          .select({ id: schema.users.id })
          .from(schema.users)
          .leftJoin(
            schema.profiles,
            eq(schema.users.id, schema.profiles.userId),
          )
          .where(
            or(
              eq(schema.users.email, data.partnerEmailOrPhone),
              eq(schema.profiles.phoneNumber, data.partnerEmailOrPhone),
            ),
          )
          .limit(1);

        if (!partnerUser) {
          throw new BadRequestException(
            'Không tìm thấy tài khoản Sporto của đồng đội. Vui lòng kiểm tra lại Email hoặc SĐT.',
          );
        }

        if (partnerUser.id === userId) {
          throw new BadRequestException(
            'Email/SĐT của đồng đội không được trùng với tài khoản của bạn.',
          );
        }

        // Check if partner already in tournament
        const partnerExisting = await tx
          .select({ userId: schema.tournamentRosters.userId })
          .from(schema.tournamentRosters)
          .innerJoin(
            schema.tournamentParticipants,
            eq(
              schema.tournamentRosters.participantId,
              schema.tournamentParticipants.id,
            ),
          )
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentRosters.userId, partnerUser.id),
              ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
              ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
              ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
            ),
          );
        if (partnerExisting.length > 0) {
          throw new BadRequestException(
            'Đồng đội của bạn đã đăng ký tham gia giải đấu này rồi.',
          );
        }

        // Enforce gender constraints for partner if any
        if (
          tournament.genderRestriction &&
          !(data.tournamentDivisionId ?? data.divisionId)
        ) {
          const [partnerProfile] = await tx
            .select({ gender: schema.profiles.gender })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, partnerUser.id))
            .limit(1);

          if (!partnerProfile || !partnerProfile.gender) {
            throw new BadRequestException(
              'Đồng đội chưa cập nhật giới tính trong hồ sơ cá nhân.',
            );
          }

          const leaderProfileRes = await tx
            .select({ gender: schema.profiles.gender })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, userId))
            .limit(1);
          const rawLeaderG = (leaderProfileRes[0]?.gender || '')
            .trim()
            .toUpperCase();
          const leaderGenderVal =
            rawLeaderG === 'NAM' || rawLeaderG === 'MALE'
              ? 'MALE'
              : rawLeaderG === 'NỮ' ||
                  rawLeaderG === 'NU' ||
                  rawLeaderG === 'FEMALE'
                ? 'FEMALE'
                : rawLeaderG;

          const rawPartnerG = (partnerProfile.gender || '')
            .trim()
            .toUpperCase();
          const partnerGenderVal =
            rawPartnerG === 'NAM' || rawPartnerG === 'MALE'
              ? 'MALE'
              : rawPartnerG === 'NỮ' ||
                  rawPartnerG === 'NU' ||
                  rawPartnerG === 'FEMALE'
                ? 'FEMALE'
                : rawPartnerG;
          const restriction = tournament.genderRestriction.toUpperCase();

          if (restriction === 'MALE' && partnerGenderVal !== 'MALE') {
            throw new BadRequestException(
              'Giải đấu chỉ dành cho Nam (cả 2 VĐV phải là Nam).',
            );
          }
          if (restriction === 'FEMALE' && partnerGenderVal !== 'FEMALE') {
            throw new BadRequestException(
              'Giải đấu chỉ dành cho Nữ (cả 2 VĐV phải là Nữ).',
            );
          }
          if (restriction === 'MIXED') {
            if (!leaderGenderVal) {
              throw new BadRequestException(
                'Bạn cần cập nhật giới tính trong hồ sơ để xác nhận Mixed Doubles.',
              );
            }
            if (leaderGenderVal === partnerGenderVal) {
              throw new BadRequestException(
                'Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.',
              );
            }
          }
        }

        partnerId = partnerUser.id;
      }

      const resolvedDivision = await resolveMatchingDivision(partnerId);
      const selectedDivision = resolvedDivision?.division ?? null;
      const isWaitlisted = resolvedDivision?.isWaitlisted === true;

      // A tournament can contain several independent divisions. In that
      // shape, the division limit is authoritative and must not be blocked by
      // the legacy tournament-level limit (otherwise an empty division shows
      // 0/16 but registration is rejected because another division is full).
      // Keep the tournament-level check only as a fallback for tournaments
      // without a configured division limit.
      if (tournament.maxParticipants && !selectedDivision?.maxParticipants) {
        const tournamentConfig = (tournament.tournamentConfig || {}) as Record<
          string,
          unknown
        >;
        if (tournamentConfig.isLite === true) {
          const isDoublesTournament =
            tournament.matchType === 'DOUBLES' ||
            tournament.matchType === 'MIXED_DOUBLES';
          const maxSlots = isDoublesTournament
            ? tournament.maxParticipants * 2
            : tournament.maxParticipants;
          const [{ count: activeRosterUsers }] = await tx
            .select({
              count: sql<number>`count(distinct ${schema.tournamentRosters.userId})`,
            })
            .from(schema.tournamentRosters)
            .innerJoin(
              schema.tournamentParticipants,
              eq(
                schema.tournamentRosters.participantId,
                schema.tournamentParticipants.id,
              ),
            )
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
              ),
            );

          if (Number(activeRosterUsers) >= maxSlots) {
            throw new BadRequestException(
              'Giải đấu đã đủ số lượng người tham gia.',
            );
          }
        } else {
          const [participantCount] = await tx
            .select({ count: count() })
            .from(schema.tournamentParticipants)
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
                eq(schema.tournamentParticipants.isPaid, true),
              ),
            );

          if (participantCount.count >= tournament.maxParticipants) {
            throw new BadRequestException('Giải đấu đã đầy.');
          }
        }
      }

      // 7. Add participant
      const effectiveMatchType =
        selectedDivision?.matchType ?? tournament.matchType;
      const isDoubles = this.isDoublesMatchType(effectiveMatchType);
      // Team sport (bóng đá): config có teamSize → đội nhiều người, không qua PENDING_PARTNER.
      const tConfigForTeam = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const isTeamSport = resolveFootballTeamConfig(tConfigForTeam).isTeamSport;
      const isDoublesPairing = isDoubles && !isTeamSport;
      if (
        isDoublesPairing &&
        requestedDoublesPairingMode === 'ORGANIZER' &&
        partnerId
      ) {
        throw new BadRequestException(
          'Nội dung này do BTC ghép đôi. Vui lòng đăng ký cá nhân, không mời đồng đội trực tiếp.',
        );
      }
      const organizerPairing =
        isDoublesPairing && requestedDoublesPairingMode === 'ORGANIZER';
      const payableEntryFeeAmount =
        await this.tournamentPaymentRepository.resolveDivisionEntryFee(
          tx,
          tournament,
          selectedDivision?.id,
        );

      const registrationDeadlines = [
        selectedDivision?.registrationEndDate,
        tournament.registrationEndDate,
      ]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];

      if (registrationDeadline && now >= registrationDeadline) {
        throw new BadRequestException(
          'Hạn đăng ký của nội dung thi đấu này đã kết thúc.',
        );
      }

      // Team sport: luôn tạo link mời mở (token), không giới hạn 1h partner.
      // Đôi: token mời đồng đội như cũ (PENDING_PARTNER, hết hạn theo deadline).
      const teamInviteToken =
        (isDoubles && !organizerPairing) ||
        (isTeamSport && !data.footballTeamId)
          ? crypto.randomUUID().replace(/-/g, '').substring(0, 12).toUpperCase()
          : null;
      const inviteBaseExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const partnerInviteExpiresAt =
        isDoubles && !organizerPairing
          ? registrationDeadline
            ? new Date(
                Math.min(
                  inviteBaseExpiresAt.getTime(),
                  registrationDeadline.getTime(),
                ),
              )
            : inviteBaseExpiresAt
          : null;

      const registrationForm = tConfigForTeam.registrationForm as
        | {
            status?: string;
            divisionIds?: unknown;
            fields?: unknown;
          }
        | null
        | undefined;
      const formApplies = Boolean(
        registrationForm?.status === 'PUBLISHED' &&
        selectedDivision &&
        (!Array.isArray(registrationForm.divisionIds) ||
          registrationForm.divisionIds.length === 0 ||
          registrationForm.divisionIds.includes(selectedDivision.id)),
      );
      if (
        formApplies &&
        registrationForm?.fields &&
        typeof registrationForm.fields === 'object' &&
        Array.isArray(registrationForm.fields)
      ) {
        const responses = data.customResponses ?? {};
        for (const rawField of registrationForm.fields) {
          if (
            !rawField ||
            typeof rawField !== 'object' ||
            Array.isArray(rawField)
          )
            continue;
          const field = rawField as Record<string, unknown>;
          const fieldId = typeof field.id === 'string' ? field.id : '';
          const value = fieldId ? responses[fieldId] : undefined;
          const isEmpty =
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);
          if (field.required === true && isEmpty) {
            throw new BadRequestException(
              `Vui lòng điền trường “${typeof field.label === 'string' ? field.label : fieldId}”.`,
            );
          }
          if (isEmpty) continue;
          if (
            field.type === 'EMAIL' &&
            (typeof value !== 'string' ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
          ) {
            throw new BadRequestException(
              `Trường “${typeof field.label === 'string' ? field.label : fieldId}” phải là email hợp lệ.`,
            );
          }
          if (
            field.type === 'PHONE' &&
            (typeof value !== 'string' ||
              !/^(?:\+84|0[35789])\d{8}$/.test(value))
          ) {
            throw new BadRequestException(
              `Trường “${typeof field.label === 'string' ? field.label : fieldId}” phải là số điện thoại Việt Nam hợp lệ.`,
            );
          }
          if (field.type === 'NUMBER') {
            const numberValue =
              typeof value === 'number' ? value : Number(value);
            if (!Number.isFinite(numberValue))
              throw new BadRequestException(
                `Trường “${typeof field.label === 'string' ? field.label : fieldId}” phải là số.`,
              );
            if (typeof field.min === 'number' && numberValue < field.min)
              throw new BadRequestException(
                `Trường “${typeof field.label === 'string' ? field.label : fieldId}” không được nhỏ hơn ${field.min}.`,
              );
            if (typeof field.max === 'number' && numberValue > field.max)
              throw new BadRequestException(
                `Trường “${typeof field.label === 'string' ? field.label : fieldId}” không được lớn hơn ${field.max}.`,
              );
          }
          if (
            field.type === 'SELECT' &&
            Array.isArray(field.options) &&
            !field.options.includes(value)
          ) {
            throw new BadRequestException(
              `Lựa chọn của trường “${typeof field.label === 'string' ? field.label : fieldId}” không hợp lệ.`,
            );
          }
          if (
            field.type === 'MULTI_SELECT' &&
            Array.isArray(field.options) &&
            (!Array.isArray(value) ||
              value.some(
                (item) => !(field.options as unknown[]).includes(item),
              ))
          ) {
            throw new BadRequestException(
              `Lựa chọn của trường “${typeof field.label === 'string' ? field.label : fieldId}” không hợp lệ.`,
            );
          }
          if (
            field.type === 'CHECKBOX' &&
            field.required === true &&
            value !== true
          ) {
            throw new BadRequestException(
              `Bạn cần xác nhận “${typeof field.label === 'string' ? field.label : fieldId}”.`,
            );
          }
        }
      }

      let finalTeamName = (data.teamName || '').trim();
      let footballTeamMemberIds: string[] = [];
      let footballTeamReserveMemberIds: string[] = [];
      let footballTeamLogoUrl: string | null = null;
      if (isTeamSport && data.footballTeamId) {
        const [footballTeam] = await tx
          .select({
            id: schema.footballTeams.id,
            name: schema.footballTeams.name,
            categoryId: schema.footballTeams.categoryId,
            logoUrl: schema.footballTeams.logoUrl,
            status: schema.footballTeams.status,
          })
          .from(schema.footballTeams)
          .where(eq(schema.footballTeams.id, data.footballTeamId))
          .limit(1);
        if (
          !footballTeam ||
          footballTeam.status !== 'ACTIVE' ||
          footballTeam.categoryId !== tournament.categoryId
        ) {
          throw new BadRequestException(
            'Đội bóng không hợp lệ cho giải đấu này.',
          );
        }
        const [leaderMembership] = await tx
          .select({ role: schema.footballTeamMembers.role })
          .from(schema.footballTeamMembers)
          .where(
            and(
              eq(schema.footballTeamMembers.teamId, data.footballTeamId),
              eq(schema.footballTeamMembers.userId, userId),
              eq(schema.footballTeamMembers.status, 'ACTIVE'),
            ),
          )
          .limit(1);
        if (
          !leaderMembership ||
          !['CAPTAIN', 'MANAGER'].includes(leaderMembership.role)
        ) {
          throw new ForbiddenException(
            'Chỉ đội trưởng hoặc quản lý mới được đăng ký đội bóng.',
          );
        }
        const footballMembers = await tx
          .select({ userId: schema.footballTeamMembers.userId })
          .from(schema.footballTeamMembers)
          .where(
            and(
              eq(schema.footballTeamMembers.teamId, data.footballTeamId),
              eq(schema.footballTeamMembers.status, 'ACTIVE'),
            ),
          );
        const teamConfig = (tournament.tournamentConfig || {}) as Record<
          string,
          unknown
        >;
        const resolvedTeamConfig = resolveFootballTeamConfig(teamConfig);
        const configuredTeamSize = resolvedTeamConfig.mainSize;
        const configuredMaxTeamSize = resolvedTeamConfig.maxTotalSize;
        const configuredMaxReserve = resolvedTeamConfig.maxReserve;
        const activeMemberIds = new Set(
          footballMembers.map((member) => member.userId),
        );
        const roster = validateFootballRosterSelection({
          leaderId: userId,
          memberIds:
            Array.isArray(data.memberIds) && data.memberIds.length > 0
              ? data.memberIds
              : footballMembers.map((member) => member.userId),
          reserveMemberIds: Array.isArray(data.reserveMemberIds)
            ? data.reserveMemberIds
            : [],
          activeMemberIds,
          // Keep incomplete selections as DRAFT; lockParticipantRoster enforces
          // the configured starting XI/VII/V once the roster is finalized.
          minMainSize: 1,
          maxMainSize: configuredTeamSize,
          maxReserve: configuredMaxReserve,
          maxTotalSize: configuredMaxTeamSize,
        });
        footballTeamMemberIds = roster.mainMemberIds;
        footballTeamReserveMemberIds = roster.reserveMemberIds;
        finalTeamName = footballTeam.name;
        footballTeamLogoUrl = footballTeam.logoUrl ?? null;
      }
      const requiredFootballMainRosterCount = isTeamSport
        ? getRequiredFootballMainRosterCount(tournament.tournamentConfig)
        : 0;
      const hasUndersizedFootballRoster =
        isTeamSport &&
        Boolean(data.footballTeamId) &&
        footballTeamMemberIds.length < requiredFootballMainRosterCount;
      const teamStatus = isDoublesPairing
        ? resolveDoublesParticipantStatus({
            event: 'REGISTER',
            registrationMode: regMode,
            waitlisted: isWaitlisted,
            isLite: isLiteRegistrationTournament(tConfig),
            pairingMode: requestedDoublesPairingMode,
            rosterCount: 1,
            hasPartnerInvite: Boolean(teamInviteToken),
          })
        : resolveNonDoublesParticipantStatus({
            registrationMode: regMode,
            waitlisted: isWaitlisted,
            incompleteRoster: hasUndersizedFootballRoster,
          });
      const isPaid = payableEntryFeeAmount === 0;

      if (isTeamSport && data.footballTeamId && selectedDivision) {
        const divisionGender = (selectedDivision.genderRestriction || '')
          .trim()
          .toUpperCase();
        if (divisionGender === 'MALE' || divisionGender === 'FEMALE') {
          const rosterIds = [
            ...footballTeamMemberIds,
            ...footballTeamReserveMemberIds,
          ];
          const rosterProfiles =
            rosterIds.length > 0
              ? await tx
                  .select({
                    userId: schema.profiles.userId,
                    gender: schema.profiles.gender,
                  })
                  .from(schema.profiles)
                  .where(inArray(schema.profiles.userId, rosterIds))
              : [];
          const profileGender = new Map(
            rosterProfiles.map((profile) => [
              profile.userId,
              (profile.gender || '').trim().toUpperCase(),
            ]),
          );
          for (const rosterId of rosterIds) {
            const rawGender = profileGender.get(rosterId);
            const normalizedGender =
              rawGender === 'NAM' || rawGender === 'MALE'
                ? 'MALE'
                : rawGender === 'NỮ' ||
                    rawGender === 'NU' ||
                    rawGender === 'FEMALE'
                  ? 'FEMALE'
                  : null;
            if (!normalizedGender) {
              throw new BadRequestException(
                'Mọi thành viên đội bóng phải cập nhật giới tính trước khi đăng ký division này.',
              );
            }
            if (normalizedGender !== divisionGender) {
              throw new BadRequestException(
                divisionGender === 'MALE'
                  ? 'Division này chỉ dành cho Nam.'
                  : 'Division này chỉ dành cho Nữ.',
              );
            }
          }
        }
      }
      if (isTeamSport && data.footballTeamId) {
        const selectedFootballMemberIds = [
          ...new Set([
            ...footballTeamMemberIds,
            ...footballTeamReserveMemberIds,
          ]),
        ];
        if (selectedFootballMemberIds.length > 0) {
          const existingFootballRoster = await tx
            .select({
              userId: schema.tournamentRosters.userId,
              divisionId: schema.tournamentParticipants.tournamentDivisionId,
            })
            .from(schema.tournamentRosters)
            .innerJoin(
              schema.tournamentParticipants,
              eq(
                schema.tournamentRosters.participantId,
                schema.tournamentParticipants.id,
              ),
            )
            .where(
              and(
                eq(schema.tournamentParticipants.tournamentId, tournamentId),
                inArray(
                  schema.tournamentRosters.userId,
                  selectedFootballMemberIds,
                ),
                ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
                ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
                ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
                ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
              ),
            );
          if (existingFootballRoster.length > 0) {
            throw new BadRequestException(
              'Một hoặc nhiều thành viên đội bóng đã đăng ký nội dung khác trong giải đấu này.',
            );
          }
        }
      }
      if (!finalTeamName) {
        const [leaderProfile] = await tx
          .select({ fullName: schema.profiles.fullName })
          .from(schema.profiles)
          .where(eq(schema.profiles.userId, userId))
          .limit(1);
        finalTeamName = leaderProfile?.fullName || 'Vận động viên';
      }

      const [participant] = await tx
        .insert(schema.tournamentParticipants)
        .values({
          tournamentId,
          tournamentDivisionId: selectedDivision?.id ?? null,
          registeredBy: userId,
          teamName: finalTeamName,
          footballTeamId: isTeamSport ? (data.footballTeamId ?? null) : null,
          footballTeamLogoUrl: isTeamSport ? footballTeamLogoUrl : null,
          rankingConsent: data.rankingConsent === true,
          customResponses: data.customResponses ?? null,
          isPaid,
          entryFeeAtRegistration: payableEntryFeeAmount.toFixed(2),
          // Keep the invite token even when a known partner was selected so the
          // invited account can confirm through the same join URL/QR flow.
          teamInviteToken,
          teamStatus,
          partnerUserId: isDoubles ? partnerId : null,
          partnerInviteExpiresAt,
        })
        .returning();

      // 10. Thêm rosters cho Leader
      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      // 10b. Team sport: thêm các thành viên (memberIds) như roster MAIN.
      if (isTeamSport) {
        const requestedMemberIds =
          footballTeamMemberIds.length > 0
            ? footballTeamMemberIds
            : Array.isArray(data.memberIds)
              ? data.memberIds
              : [];
        const uniqueMemberIds = [
          ...new Set(requestedMemberIds.filter((mid) => mid !== userId)),
        ];
        for (const mid of uniqueMemberIds) {
          // Chống trùng + không để user đã ở roster khác của giải
          const [existing] = await tx
            .select()
            .from(schema.tournamentRosters)
            .where(
              and(
                eq(schema.tournamentRosters.participantId, participant.id),
                eq(schema.tournamentRosters.userId, mid),
              ),
            )
            .limit(1);
          if (existing) continue;
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: mid,
            role: 'MAIN',
          });
        }
        for (const reserveId of [...new Set(footballTeamReserveMemberIds)]) {
          if (reserveId === userId || uniqueMemberIds.includes(reserveId))
            continue;
          await tx.insert(schema.tournamentRosters).values({
            participantId: participant.id,
            userId: reserveId,
            role: 'RESERVE',
          });
        }
      }

      // Keep a first-class football entry/snapshot alongside the legacy
      // participant rows. The participant remains the bracket-compatible
      // source, while this entry tracks per-member confirmation and survives
      // later changes to the external team.
      if (isTeamSport && data.footballTeamId && selectedDivision?.id) {
        const snapshotMainMemberIds = [
          ...new Set(
            (footballTeamMemberIds.length > 0
              ? footballTeamMemberIds
              : [userId]
            ).filter((memberId) => memberId.trim().length > 0),
          ),
        ];
        const snapshotReserveMemberIds = [
          ...new Set(
            footballTeamReserveMemberIds.filter(
              (memberId) => memberId.trim().length > 0,
            ),
          ),
        ];
        const snapshotMemberIds = [
          ...snapshotMainMemberIds,
          ...snapshotReserveMemberIds,
        ];
        const captainRows = await tx
          .select({ userId: schema.footballTeamMembers.userId })
          .from(schema.footballTeamMembers)
          .where(
            and(
              eq(schema.footballTeamMembers.teamId, data.footballTeamId),
              eq(schema.footballTeamMembers.status, 'ACTIVE'),
              or(
                eq(schema.footballTeamMembers.role, 'CAPTAIN'),
                eq(schema.footballTeamMembers.role, 'MANAGER'),
              ),
            ),
          );
        const captainIdsSnapshot = captainRows.map((row) => row.userId);
        const requiredMainRosterCount = getRequiredFootballMainRosterCount(
          tournament.tournamentConfig,
        );
        const hasPendingConfirmation = snapshotMemberIds.some(
          (memberId) => memberId !== userId,
        );
        const hasUndersizedMainRoster =
          snapshotMainMemberIds.length < requiredMainRosterCount;
        const [entry] = await tx
          .insert(schema.tournamentTeamEntries)
          .values({
            tournamentId,
            divisionId: selectedDivision.id,
            teamId: data.footballTeamId,
            status: hasUndersizedMainRoster
              ? 'DRAFT'
              : hasPendingConfirmation
                ? 'PENDING_CONFIRMATION'
                : 'CONFIRMED',
            displayNameSnapshot: finalTeamName,
            logoUrlSnapshot: footballTeamLogoUrl,
            captainIdsSnapshot,
            createdBy: userId,
            confirmedAt: hasPendingConfirmation ? null : new Date(),
          })
          .returning({ id: schema.tournamentTeamEntries.id });

        if (entry) {
          await tx.insert(schema.tournamentTeamRosterSnapshots).values(
            snapshotMemberIds.map((memberId) => ({
              entryId: entry.id,
              userId: memberId,
              role: snapshotMainMemberIds.includes(memberId)
                ? 'MAIN'
                : 'RESERVE',
              confirmationStatus: memberId === userId ? 'CONFIRMED' : 'PENDING',
            })),
          );
        }
      }

      // Payment intent is created later by the checkout flow.
      const paymentUrl: string | null = null;

      // 12. Audit log
      await this.auditService.logCreate(
        tx,
        userId,
        'tournament_participants',
        participant.id,
        participant,
      );

      const registrationRosterCount = isTeamSport
        ? 1 +
          new Set([
            ...footballTeamMemberIds.filter((memberId) => memberId !== userId),
            ...footballTeamReserveMemberIds,
          ]).size
        : partnerId
          ? 2
          : 1;
      const registrationMainRosterCount = isTeamSport
        ? footballTeamMemberIds.length
        : registrationRosterCount;
      const registrationRosterComplete = isRegistrationRosterCompleteForPayment(
        {
          teamStatus: participant.teamStatus,
          matchType: effectiveMatchType,
          isFootball: isTeamSport,
          rosterCount: registrationRosterCount,
          mainRosterCount: registrationMainRosterCount,
          requiredFootballMainRosterCount,
        },
      );

      return {
        participant,
        entryFee: payableEntryFeeAmount,
        paymentUrl,
        paymentEligible:
          registrationRosterComplete &&
          !participant.isPaid &&
          Number.isSafeInteger(payableEntryFeeAmount) &&
          payableEntryFeeAmount > 0,
        teamInviteLink:
          ((isDoubles && !organizerPairing) ||
            (isTeamSport && !data.footballTeamId)) &&
          teamInviteToken
            ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${teamInviteToken}`
            : null,
        isWaitlisted,
      };
    });
  }
  async acceptPartnerInvite(participantId: string, partnerUserId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);

      if (!participant) {
        throw new NotFoundException(
          'Lời mời ghép đôi không tồn tại hoặc đã bị hủy.',
        );
      }

      if (
        !participant.partnerInviteExpiresAt ||
        new Date() >= participant.partnerInviteExpiresAt
      ) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException(
          'Lời mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.',
        );
      }

      if (participant.teamStatus !== 'PENDING_PARTNER') {
        throw new BadRequestException(
          'Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.',
        );
      }

      if (
        participant.partnerUserId &&
        participant.partnerUserId !== partnerUserId
      ) {
        throw new BadRequestException(
          'Chỉ đúng tài khoản đồng đội được mời mới có thể xác nhận lời mời này.',
        );
      }

      const [tournament] = await tx
        .select({
          tournamentConfig: schema.tournaments.tournamentConfig,
          registrationEndDate: schema.tournaments.registrationEndDate,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, participant.tournamentId))
        .limit(1);
      const [division] = participant.tournamentDivisionId
        ? await tx
            .select({
              registrationEndDate:
                schema.tournamentDivisions.registrationEndDate,
              matchType: schema.tournamentDivisions.matchType,
              genderRestriction: schema.tournamentDivisions.genderRestriction,
            })
            .from(schema.tournamentDivisions)
            .where(
              eq(
                schema.tournamentDivisions.id,
                participant.tournamentDivisionId,
              ),
            )
            .limit(1)
        : [null];
      const registrationDeadlines = [
        tournament?.registrationEndDate,
        division?.registrationEndDate,
      ]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];
      if (registrationDeadline && new Date() >= registrationDeadline) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException(
          'Giải đấu đã đóng đăng ký. Lời mời ghép đôi không thể xác nhận thêm.',
        );
      }

      const [leaderRoster] = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, participantId))
        .limit(1);
      const [leaderProfile] = leaderRoster
        ? await tx
            .select({ gender: schema.profiles.gender })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, leaderRoster.userId))
            .limit(1)
        : [null];
      const [partnerProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, partnerUserId))
        .limit(1);
      const leaderGender = this.normalizeGender(leaderProfile?.gender);
      const partnerGender = this.normalizeGender(partnerProfile?.gender);
      if (!leaderGender || !partnerGender) {
        throw new BadRequestException(
          'Cáº£ hai VÄV cáº§n cáº­p nháº­t giá»›i tÃ­nh trong há»“ sÆ¡ Ä‘á»ƒ tham gia.',
        );
      }
      const targetGender =
        leaderGender === partnerGender ? leaderGender : 'MIXED';
      const targetMatchType =
        targetGender === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';
      const divisionGender =
        normalizeGenderRestriction(division?.genderRestriction) ??
        (division?.genderRestriction || '').toUpperCase();
      if (
        division &&
        (division.matchType !== targetMatchType ||
          (divisionGender &&
            divisionGender !== 'OPEN' &&
            divisionGender !== targetGender))
      ) {
        throw new BadRequestException(
          'Äá»“ng Ä‘á»™i khÃ´ng phÃ¹ há»£p vá»›i hÃ¬nh thá»©c thi Ä‘áº¥u Ä‘Ã£ Ä‘Äƒng kÃ½.',
        );
      }

      // Check duplicate roster
      const existingRosters = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(
          and(
            eq(schema.tournamentRosters.participantId, participantId),
            eq(schema.tournamentRosters.userId, partnerUserId),
          ),
        );

      if (existingRosters.length === 0) {
        await tx.insert(schema.tournamentRosters).values({
          participantId,
          userId: partnerUserId,
          role: 'MAIN',
        });
      }

      const partnerConfig = (tournament?.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const targetStatus =
        partnerConfig.registrationMode === 'APPROVAL'
          ? 'PENDING_APPROVAL'
          : 'COMPLETE';

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: targetStatus,
          partnerUserId: participant.partnerUserId || partnerUserId,
          partnerInviteExpiresAt: null,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      return updated;
    });
  }
  async rejectPartnerInvite(participantId: string, partnerUserId: string) {
    return await this.db.transaction(async (tx) => {
      const [participant] = await tx
        .select({
          id: schema.tournamentParticipants.id,
          partnerUserId: schema.tournamentParticipants.partnerUserId,
          teamStatus: schema.tournamentParticipants.teamStatus,
          partnerInviteExpiresAt:
            schema.tournamentParticipants.partnerInviteExpiresAt,
        })
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .for('update')
        .limit(1);

      if (!participant) {
        throw new NotFoundException(
          'Lời mời ghép đôi không tồn tại hoặc đã bị hủy.',
        );
      }
      if (
        participant.partnerUserId &&
        participant.partnerUserId !== partnerUserId
      ) {
        throw new BadRequestException(
          'Chỉ đúng tài khoản đồng đội được mời mới có thể từ chối lời mời này.',
        );
      }
      if (
        !participant.partnerInviteExpiresAt ||
        new Date() >= participant.partnerInviteExpiresAt
      ) {
        await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException('Lời mời ghép đôi đã hết hạn.');
      }
      if (participant.teamStatus !== 'PENDING_PARTNER') {
        throw new BadRequestException(
          'Lời mời ghép đôi này đã được xử lý hoặc đã kết thúc.',
        );
      }

      const [updated] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'EXPIRED', partnerInviteExpiresAt: null })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();
      return updated;
    });
  }
  async joinTeam(
    tournamentId: string,
    userId: string,
    participantId: string,
    teamInviteToken: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      // 1.5 Kiểm tra Exclusion Rule cho đồng đội (partner)
      const [seriesEvent] = await tx
        .select({
          event: schema.seriesEvents,
          leg: schema.seriesLegs,
          series: schema.tournamentSeries,
        })
        .from(schema.seriesEvents)
        .innerJoin(
          schema.seriesLegs,
          eq(schema.seriesEvents.legId, schema.seriesLegs.id),
        )
        .innerJoin(
          schema.tournamentSeries,
          eq(schema.seriesLegs.seriesId, schema.tournamentSeries.id),
        )
        .where(eq(schema.seriesEvents.tournamentId, tournamentId))
        .limit(1);

      if (seriesEvent && seriesEvent.series.rules) {
        const rules = seriesEvent.series.rules as unknown as {
          exclusionRule?: boolean;
          exclusionScope?: 'CATEGORY' | 'ALL';
        };
        if (rules.exclusionRule) {
          const scope = rules.exclusionScope || 'CATEGORY';
          const conds = [
            eq(schema.seriesStandings.legId, seriesEvent.leg.id),
            eq(schema.seriesStandings.userId, userId),
            eq(schema.seriesStandings.lockedOut, true),
          ];
          if (scope === 'CATEGORY') {
            conds.push(
              eq(schema.seriesStandings.categoryId, tournament.categoryId),
            );
          }
          const [standing] = await tx
            .select()
            .from(schema.seriesStandings)
            .where(and(...conds))
            .limit(1);

          if (standing) {
            throw new ExclusionRuleException(
              `Bạn đã giành Vé Thẳng trong chặng này và bị khóa không được tham gia tiếp nội dung ${
                scope === 'CATEGORY' ? 'này' : 'thi đấu thuộc chặng'
              }.`,
            );
          }
        }
      }

      // 2. Tìm participant khớp với token
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(schema.tournamentParticipants.teamInviteToken, teamInviteToken),
          ),
        )
        .for('update')
        .limit(1);

      if (!participant) {
        throw new BadRequestException(
          'Mã mời đồng đội hoặc đội thi đấu không hợp lệ.',
        );
      }

      // Team sport (bóng đá): link mời MỞ — không giới hạn partner/1h, không cần PENDING_PARTNER.
      const teamConfig = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const isTeamSport = resolveFootballTeamConfig(teamConfig).isTeamSport;

      if (!isTeamSport) {
        if (
          !participant.partnerInviteExpiresAt ||
          new Date() >= participant.partnerInviteExpiresAt
        ) {
          await tx
            .update(schema.tournamentParticipants)
            .set({
              teamStatus: 'EXPIRED',
              teamInviteToken: null,
              partnerInviteExpiresAt: null,
            })
            .where(eq(schema.tournamentParticipants.id, participantId));
          throw new BadRequestException(
            'Mã mời ghép đôi đã hết hạn. Suất giữ chỗ đã được giải phóng.',
          );
        }

        if (participant.teamStatus !== 'PENDING_PARTNER') {
          throw new BadRequestException(
            'Đội thi đấu này đã đủ thành viên hoặc không ở trạng thái chờ.',
          );
        }

        if (participant.partnerUserId && participant.partnerUserId !== userId) {
          throw new BadRequestException(
            'Chỉ đúng tài khoản đồng đội đã được mời mới có thể tham gia đội này.',
          );
        }
      }

      // 3. Kiểm tra user chưa đăng ký giải này
      const existingRosters = await tx
        .select({ userId: schema.tournamentRosters.userId })
        .from(schema.tournamentRosters)
        .innerJoin(
          schema.tournamentParticipants,
          eq(
            schema.tournamentRosters.participantId,
            schema.tournamentParticipants.id,
          ),
        )
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ),
        );
      if (existingRosters.length > 0) {
        throw new BadRequestException(
          'Bạn đã đăng ký tham gia giải đấu này rồi.',
        );
      }

      const [division] = participant.tournamentDivisionId
        ? await tx
            .select()
            .from(schema.tournamentDivisions)
            .where(
              eq(
                schema.tournamentDivisions.id,
                participant.tournamentDivisionId,
              ),
            )
            .limit(1)
        : [null];

      const registrationDeadlines = [
        tournament.registrationEndDate,
        division?.registrationEndDate,
      ]
        .filter(Boolean)
        .map((value) => new Date(value as Date | string));
      const registrationDeadline = registrationDeadlines.sort(
        (a, b) => a.getTime() - b.getTime(),
      )[0];
      if (registrationDeadline && new Date() >= registrationDeadline) {
        await tx
          .update(schema.tournamentParticipants)
          .set({
            teamStatus: 'EXPIRED',
            teamInviteToken: null,
            partnerInviteExpiresAt: null,
          })
          .where(eq(schema.tournamentParticipants.id, participantId));
        throw new BadRequestException(
          'Giải đấu đã đóng đăng ký. Mã mời ghép đôi không thể sử dụng thêm.',
        );
      }

      // 4. Lấy giới tính của Leader và Partner để kiểm tra ràng buộc
      const leaderRoster = await tx
        .select()
        .from(schema.tournamentRosters)
        .where(
          and(
            eq(schema.tournamentRosters.participantId, participantId),
            eq(schema.tournamentRosters.userId, participant.registeredBy),
          ),
        )
        .limit(1);

      if (leaderRoster.length === 0) {
        throw new BadRequestException('Không tìm thấy trưởng nhóm.');
      }
      const leaderId = leaderRoster[0].userId;

      const [leaderProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, leaderId))
        .limit(1);

      const [partnerProfile] = await tx
        .select({ gender: schema.profiles.gender })
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);

      const teamLeaderGender = this.normalizeGender(leaderProfile?.gender);
      const teamPartnerGender = this.normalizeGender(partnerProfile?.gender);

      // Team sport (bóng đá): bỏ ép giới tính kiểu đôi — đội gồm nhiều người.
      if (!isTeamSport && division) {
        if (
          (teamLeaderGender !== 'MALE' && teamLeaderGender !== 'FEMALE') ||
          (teamPartnerGender !== 'MALE' && teamPartnerGender !== 'FEMALE')
        ) {
          throw new BadRequestException(
            'Cả hai VĐV cần cập nhật giới tính trong hồ sơ để tham gia.',
          );
        }

        const targetGenderRestriction =
          teamLeaderGender === teamPartnerGender ? teamLeaderGender : 'MIXED';
        const targetMatchType =
          targetGenderRestriction === 'MIXED' ? 'MIXED_DOUBLES' : 'DOUBLES';

        const divGender =
          normalizeGenderRestriction(division.genderRestriction) ??
          (division.genderRestriction || '').toUpperCase();
        const isMatchTypeValid =
          division.matchType === targetMatchType ||
          (division.matchType === 'DOUBLES' &&
            targetMatchType === 'MIXED_DOUBLES' &&
            (!divGender || divGender === 'OPEN'));
        if (
          !isMatchTypeValid ||
          (divGender &&
            divGender !== 'OPEN' &&
            divGender !== targetGenderRestriction)
        ) {
          throw new BadRequestException(
            'Đồng đội không phù hợp với hình thức thi đấu đã đăng ký.',
          );
        }
      } else if (!isTeamSport && tournament.genderRestriction) {
        if (!teamPartnerGender) {
          throw new BadRequestException(
            'Vui lòng cập nhật giới tính trong hồ sơ để tham gia.',
          );
        }
        const restriction =
          normalizeGenderRestriction(tournament.genderRestriction) ??
          tournament.genderRestriction.toUpperCase();

        if (restriction === 'MALE' && teamPartnerGender !== 'MALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nam.');
        }
        if (restriction === 'FEMALE' && teamPartnerGender !== 'FEMALE') {
          throw new BadRequestException('Giải đấu chỉ dành cho Nữ.');
        }
        if (restriction === 'MIXED') {
          if (!teamLeaderGender) {
            throw new BadRequestException(
              'Không tìm thấy giới tính của trưởng nhóm để xác nhận Mixed Doubles.',
            );
          }
          if (teamLeaderGender === teamPartnerGender) {
            throw new BadRequestException(
              'Giải đấu Mixed Doubles yêu cầu 1 Nam và 1 Nữ.',
            );
          }
        }
      }

      // Team sport: giới hạn số thành viên theo maxTeamSize (MAIN + RESERVE)
      if (isTeamSport) {
        const maxTeamSize = resolveFootballTeamConfig(teamConfig).maxTotalSize;
        if (Number.isFinite(maxTeamSize) && maxTeamSize > 0) {
          const [countRes] = await tx
            .select({ total: sql<number>`count(*)::int` })
            .from(schema.tournamentRosters)
            .where(eq(schema.tournamentRosters.participantId, participantId));
          if (Number(countRes?.total ?? 0) >= maxTeamSize) {
            throw new BadRequestException('Đội đã đủ số thành viên tối đa.');
          }
        }
      }

      // 5. Thêm roster cho Partner (team sport: role MAIN, người join qua link)
      await tx.insert(schema.tournamentRosters).values({
        participantId: participant.id,
        userId: userId,
        role: 'MAIN',
      });

      // 6. Cập nhật trạng thái đội hoàn tất:
      // - OPEN => COMPLETE
      // - APPROVAL => PENDING_APPROVAL
      const entryFeeAmount =
        participant.entryFeeAtRegistration !== null &&
        participant.entryFeeAtRegistration !== undefined
          ? Number(participant.entryFeeAtRegistration)
          : await this.tournamentPaymentRepository.resolveDivisionEntryFee(
              tx,
              tournament,
              participant.tournamentDivisionId,
            );
      const isPaid = entryFeeAmount === 0;

      const tCfg = (tournament.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const rawRegMode = (tCfg.registrationMode as string) || 'OPEN';
      const regMode = rawRegMode;
      const targetStatus =
        regMode === 'APPROVAL' ? 'PENDING_APPROVAL' : 'COMPLETE';

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: targetStatus,
          isPaid,
        })
        .where(eq(schema.tournamentParticipants.id, participantId))
        .returning();

      // Payment intent is created later by the checkout flow.
      const paymentUrl: string | null = null;

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_participants',
        participantId,
        participant,
        updatedParticipant,
      );

      return {
        participant: updatedParticipant,
        paymentUrl,
      };
    });
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
    return await this.db.transaction(async (tx) => {
      // 1. Tìm participant mà user đang tham gia
      const userRoster = await tx
        .select({ participantId: schema.tournamentRosters.participantId })
        .from(schema.tournamentRosters)
        .innerJoin(
          schema.tournamentParticipants,
          eq(
            schema.tournamentRosters.participantId,
            schema.tournamentParticipants.id,
          ),
        )
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentRosters.userId, userId),
            ...(divisionId
              ? [
                  eq(
                    schema.tournamentParticipants.tournamentDivisionId,
                    divisionId,
                  ),
                ]
              : []),
            ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
            ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
            ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ),
        )
        .limit(1);

      if (userRoster.length === 0) {
        throw new BadRequestException(
          'Bạn chưa đăng ký giải đấu này hoặc đã rút lui.',
        );
      }

      const participantId = userRoster[0].participantId;

      const [oldParticipant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      if (!oldParticipant)
        throw new NotFoundException('Không tìm thấy người tham gia');

      // A confirmed participant may still withdraw before the tournament starts.
      // Paid registrations become PENDING_REFUND and are handled by the organizer.

      // 2. Kiểm tra giải đấu chưa bắt đầu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      if (
        tournament.status === 'IN_PROGRESS' ||
        tournament.status === 'COMPLETED'
      ) {
        throw new BadRequestException(
          'Giải đấu đã bắt đầu hoặc kết thúc, không thể rút lui.',
        );
      }

      // 2.5 Lấy bank details từ request body hoặc từ profile của user
      const [profile] = await tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.userId, userId))
        .limit(1);

      const finalBankName = bankData?.bankName || profile?.bankName;
      const finalBankAccountNumber =
        bankData?.bankAccountNumber || profile?.bankAccountNumber;
      const finalBankAccountName =
        bankData?.bankAccountName || profile?.bankAccountName;
      const completedPayment =
        await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
          tx,
          tournamentId,
          participantId,
        );
      const requestedAt = new Date();
      const refundQuote =
        completedPayment &&
        completedPayment.refundStatus === null &&
        Number(completedPayment.refundableAmount) > 0
          ? calculateTournamentRefundQuote({
              amount: completedPayment.amount,
              platformFeeAmount: completedPayment.platformFeeAmount,
              refundedAmount: completedPayment.refundedAmount,
              registeredAt: oldParticipant.registeredAt,
              requestedAt,
              trigger: 'WITHDRAWAL',
            })
          : null;

      if (
        refundQuote &&
        Number(refundQuote.refundAmount) > 0 &&
        (!finalBankName?.trim() ||
          !finalBankAccountNumber?.trim() ||
          !finalBankAccountName?.trim())
      ) {
        throw new BadRequestException(
          'Vui lòng nhập đầy đủ thông tin tài khoản ngân hàng để nhận lại tiền hoàn lệ phí.',
        );
      }

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'WITHDRAWN', teamInviteToken: null })
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            eq(
              schema.tournamentParticipants.teamStatus,
              oldParticipant.teamStatus,
            ),
          ),
        )
        .returning();
      if (!updatedParticipant) {
        throw new BadRequestException('Trạng thái đăng ký đã thay đổi.');
      }

      await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
        tx,
        tournamentId,
        participantId,
        'PARTICIPANT_WITHDRAWN',
      );

      const refundAmount = refundQuote?.refundAmount ?? null;
      const feeDeducted = refundQuote?.feeDeducted ?? null;
      if (
        completedPayment &&
        refundQuote &&
        Number(refundQuote.refundAmount) > 0
      ) {
        await this.tournamentPaymentRepository.createPendingRefund(tx, {
          paymentId: completedPayment.id,
          amount: refundQuote.refundAmount,
          reason: refundQuote.reason,
          requestedBy: userId,
          bankName: finalBankName,
          bankAccountNumber: finalBankAccountNumber,
          bankAccountName: finalBankAccountName,
        });
      }

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_participants',
        participantId,
        oldParticipant,
        updatedParticipant,
      );

      // 5. Promote waitlisted participant nếu có slot trống
      await this.promoteNextWaitlisted(
        tx,
        tournamentId,
        oldParticipant.tournamentDivisionId ?? undefined,
      );

      return {
        message: refundQuote
          ? Number(refundQuote.refundAmount) > 0
            ? 'Yêu cầu hoàn tiền đã được gửi cho Ban tổ chức.'
            : 'Đã rút lui; không phát sinh khoản hoàn sau khi áp dụng phí đã lưu.'
          : completedPayment?.refundStatus === 'PENDING_REFUND'
            ? 'Đã rút lui; khoản hoàn đang chờ Ban tổ chức xử lý.'
            : 'Đã rút lui; không có khoản thanh toán còn lại để hoàn.',
        feeDeducted,
        refundAmount,
        refundReason: refundQuote?.reason ?? null,
        refundStatus:
          refundQuote && Number(refundQuote.refundAmount) > 0
            ? 'PENDING_REFUND'
            : completedPayment?.refundStatus ?? null,
      };
    });
  }
  async kickParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
  ) {
    return await this.db.transaction(async (tx) => {
      // 1. Kiểm tra giải đấu
      const [tournament] = await tx
        .select()
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

      // 2. Kiểm tra participant
      const [participant] = await tx
        .select()
        .from(schema.tournamentParticipants)
        .where(eq(schema.tournamentParticipants.id, participantId))
        .limit(1);

      if (!participant)
        throw new NotFoundException('Không tìm thấy người tham gia');

      if (participant.tournamentId !== tournamentId) {
        throw new NotFoundException('Người tham gia không thuộc giải đấu này');
      }

      if (['COMPLETED', 'CANCELLED'].includes(tournament.status)) {
        throw new BadRequestException(
          'Giải đấu đã kết thúc, không thể kick người tham gia.',
        );
      }

      const [updatedParticipant] = await tx
        .update(schema.tournamentParticipants)
        .set({ teamStatus: 'KICKED', teamInviteToken: null })
        .where(
          and(
            eq(schema.tournamentParticipants.id, participantId),
            notInArray(schema.tournamentParticipants.teamStatus, [
              'KICKED',
              'WITHDRAWN',
              'REJECTED',
              'CANCELLED',
            ]),
          ),
        )
        .returning();
      if (!updatedParticipant) {
        throw new BadRequestException(
          'Người tham gia đã ở trạng thái kết thúc.',
        );
      }

      await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
        tx,
        tournamentId,
        participantId,
        'PARTICIPANT_KICKED',
      );

      let refundAmount: string | null = null;
      let feeDeducted: string | null = null;
      let refundReason: string | null = null;
      const completedPayment =
        await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
          tx,
          tournamentId,
          participantId,
        );
      if (
        completedPayment &&
        completedPayment.refundStatus === null &&
        Number(completedPayment.refundableAmount) > 0
      ) {
        const refundQuote = calculateTournamentRefundQuote({
          amount: completedPayment.amount,
          platformFeeAmount: completedPayment.platformFeeAmount,
          refundedAmount: completedPayment.refundedAmount,
          registeredAt: participant.registeredAt,
          requestedAt: new Date(),
          trigger: 'KICKED',
        });
        if (Number(refundQuote.refundAmount) > 0) {
          const [profile] = await tx
            .select({
              bankName: schema.profiles.bankName,
              bankAccountNumber: schema.profiles.bankAccountNumber,
              bankAccountName: schema.profiles.bankAccountName,
            })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, completedPayment.userId))
            .limit(1);
          await this.tournamentPaymentRepository.createPendingRefund(tx, {
            paymentId: completedPayment.id,
            amount: refundQuote.refundAmount,
            reason: refundQuote.reason,
            requestedBy: userId,
            bankName: profile?.bankName ?? undefined,
            bankAccountNumber: profile?.bankAccountNumber ?? undefined,
            bankAccountName: profile?.bankAccountName ?? undefined,
          });
          refundAmount = refundQuote.refundAmount;
          feeDeducted = refundQuote.feeDeducted;
          refundReason = refundQuote.reason;
        }
      }

      // 5. Xử lý Walkover/BYE trong sơ đồ thi đấu
      const activeMatches = await tx
        .select()
        .from(schema.matches)
        .where(
          and(
            or(
              eq(schema.matches.status, 'SCHEDULED'),
              eq(schema.matches.status, 'ONGOING'),
            ),
            or(
              eq(schema.matches.participant1Id, participantId),
              eq(schema.matches.participant2Id, participantId),
            ),
          ),
        );

      for (const match of activeMatches) {
        const opponentId =
          match.participant1Id === participantId
            ? match.participant2Id
            : match.participant1Id;

        const winnerId = opponentId || null;

        await tx
          .update(schema.matches)
          .set({
            status: 'COMPLETED',
            winnerId,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.matches.id, match.id));

        if (match.nextMatchId && winnerId) {
          const [nextMatch] = await tx
            .select()
            .from(schema.matches)
            .where(eq(schema.matches.id, match.nextMatchId))
            .limit(1);

          const targetSlot = resolveWinnerTargetSlot({
            sourceBranch: match.bracketBranch,
            sourceRoundNumber: match.roundNumber,
            sourceMatchOrder: match.matchOrder,
            targetBranch: nextMatch?.bracketBranch ?? 'MAIN',
          });
          const updateField = { [targetSlot]: winnerId };

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.nextMatchId));
        }

        if (match.loserNextMatchId) {
          const targetSlot = resolveLoserTargetSlot({
            sourceRoundNumber: match.roundNumber,
            sourceMatchOrder: match.matchOrder,
          });
          const updateField = { [targetSlot]: null };

          await tx
            .update(schema.matches)
            .set(updateField)
            .where(eq(schema.matches.id, match.loserNextMatchId));
        }
      }

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_participants',
        participantId,
        participant,
        updatedParticipant,
      );

      return {
        message: refundAmount
          ? 'Yêu cầu hoàn toàn bộ khoản đã thanh toán đã được gửi cho Ban tổ chức.'
          : completedPayment?.refundStatus === 'PENDING_REFUND'
            ? 'Khoản hoàn đang chờ Ban tổ chức xử lý.'
            : 'Đã kick; không có khoản thanh toán còn lại để tạo yêu cầu hoàn.',
        refundAmount,
        feeDeducted,
        refundReason,
        refundStatus:
          refundAmount !== null
            ? 'PENDING_REFUND'
            : completedPayment?.refundStatus ?? null,
      };
    });
  }
  async myRegistration(
    tournamentId: string,
    userId: string,
    divisionId?: string,
  ) {
    const userRoster = await this.db
      .select({ participantId: schema.tournamentRosters.participantId })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentRosters.participantId,
          schema.tournamentParticipants.id,
        ),
      )
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentRosters.userId, userId),
          ...(divisionId
            ? [
                eq(
                  schema.tournamentParticipants.tournamentDivisionId,
                  divisionId,
                ),
              ]
            : []),
          ne(schema.tournamentParticipants.teamStatus, 'WITHDRAWN'),
          ne(schema.tournamentParticipants.teamStatus, 'REJECTED'),
          ne(schema.tournamentParticipants.teamStatus, 'KICKED'),
          ne(schema.tournamentParticipants.teamStatus, 'EXPIRED'),
        ),
      )
      .limit(1);

    if (userRoster.length === 0) {
      return { registered: false };
    }

    const participantId = userRoster[0].participantId;

    const [participant] = await this.db
      .select()
      .from(schema.tournamentParticipants)
      .where(eq(schema.tournamentParticipants.id, participantId))
      .limit(1);

    const members = await this.db
      .select({
        userId: schema.tournamentRosters.userId,
        role: schema.tournamentRosters.role,
        fullName: schema.profiles.fullName,
        avatarUrl: schema.profiles.avatarUrl,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.users,
        eq(schema.tournamentRosters.userId, schema.users.id),
      )
      .innerJoin(schema.profiles, eq(schema.users.id, schema.profiles.userId))
      .where(eq(schema.tournamentRosters.participantId, participantId));

    const hasRegistrationFeeSnapshot =
      participant.entryFeeAtRegistration !== null &&
      participant.entryFeeAtRegistration !== undefined;
    let payableEntryFeeAmount = hasRegistrationFeeSnapshot
      ? Number(participant.entryFeeAtRegistration)
      : 0;
    let divisionMatchType: string | null = null;
    if (!hasRegistrationFeeSnapshot) {
      const [tournamentFeeRow] = await this.db
        .select({
          id: schema.tournaments.id,
          entryFee: schema.tournaments.entryFee,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);
      payableEntryFeeAmount = tournamentFeeRow
        ? await this.tournamentPaymentRepository.resolveDivisionEntryFee(
            this.db,
            tournamentFeeRow,
            participant.tournamentDivisionId,
          )
        : 0;
      if (participant.tournamentDivisionId) {
        const [divisionFeeRow] = await this.db
          .select({
            entryFee: schema.tournamentDivisions.entryFee,
            matchType: schema.tournamentDivisions.matchType,
          })
          .from(schema.tournamentDivisions)
          .where(
            eq(schema.tournamentDivisions.id, participant.tournamentDivisionId),
          )
          .limit(1);
        divisionMatchType = divisionFeeRow?.matchType ?? null;
        // Keep the division lookup for match type, while the fee resolver
        // above applies the explicit override/inherit semantics.
      }
    } else if (participant.tournamentDivisionId) {
      const [divisionRow] = await this.db
        .select({ matchType: schema.tournamentDivisions.matchType })
        .from(schema.tournamentDivisions)
        .where(
          eq(schema.tournamentDivisions.id, participant.tournamentDivisionId),
        )
        .limit(1);
      divisionMatchType = divisionRow?.matchType ?? null;
    }
    const rosterCount = members.length;
    const [registrationTournament] = await this.db
      .select({ tournamentConfig: schema.tournaments.tournamentConfig })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .limit(1);
    const tournamentConfig = registrationTournament?.tournamentConfig;
    const isLiteRegistration = isLiteRegistrationTournament(tournamentConfig);
    const footballConfig = resolveFootballTeamConfig(tournamentConfig);
    const isFootball =
      Boolean(participant.footballTeamId) || footballConfig.isTeamSport;
    const rosterComplete = isRegistrationRosterCompleteForPayment({
      teamStatus: participant.teamStatus,
      matchType: divisionMatchType,
      isFootball,
      rosterCount,
      mainRosterCount: members.filter((member) => member.role === 'MAIN')
        .length,
      requiredFootballMainRosterCount: footballConfig.mainSize,
    });
    const [completedRegistrationPayment] = await this.db
      .select({
        id: schema.payments.id,
        refundableAmount: sql<string>`GREATEST(${schema.payments.amount} - COALESCE(${schema.payments.refundedAmount}, 0), 0)`,
        refundStatus: schema.payments.refundStatus,
      })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.participantId, participant.id),
          eq(schema.payments.purpose, 'REGISTRATION_FEE'),
          eq(schema.payments.status, 'COMPLETED'),
        ),
      )
      .orderBy(desc(schema.payments.paidAt), desc(schema.payments.createdAt))
      .limit(1);
    const effectiveIsPaid = isRegistrationFeePaid({
      persistedIsPaid: participant.isPaid,
      feeSnapshot: payableEntryFeeAmount,
      hasCompletedPayment: Boolean(completedRegistrationPayment),
      isLiteRegistration,
    });
    const hasRefundablePayment = Boolean(
      completedRegistrationPayment &&
      Number(completedRegistrationPayment.refundableAmount) > 0 &&
      completedRegistrationPayment.refundStatus !== 'REFUNDED',
    );
    const paymentEligible =
      rosterComplete &&
      !effectiveIsPaid &&
      !completedRegistrationPayment &&
      Number.isSafeInteger(payableEntryFeeAmount) &&
      payableEntryFeeAmount > 0;

    return {
      registered: true,
      paymentEligible,
      participant: {
        id: participant.id,
        teamName: participant.teamName,
        teamStatus: participant.teamStatus,
        partnerUserId: participant.partnerUserId,
        isPaid: effectiveIsPaid,
        hasRefundablePayment,
        tournamentDivisionId: participant.tournamentDivisionId,
        entryFeeAtRegistration: participant.entryFeeAtRegistration,
        registeredAt: participant.registeredAt,

        teamInviteToken: participant.teamInviteToken,
        partnerInviteExpiresAt: participant.partnerInviteExpiresAt,
        members,
        teamMembers: members,
        teamInviteLink:
          participant.teamStatus === 'PENDING_PARTNER' &&
          participant.registeredBy === userId &&
          participant.teamInviteToken
            ? `/tournaments/${tournamentId}/join-team?pid=${participant.id}&token=${participant.teamInviteToken}`
            : null,
      },
    };
  }
  async cancelPendingRegistrationsIfFull(
    tournamentId: string,
  ): Promise<Array<{ leaderId: string; divisionId: string | null }>> {
    return await this.db.transaction(async (tx) => {
      const [tournament] = await tx
        .select({
          maxParticipants: schema.tournaments.maxParticipants,
          entryFee: schema.tournaments.entryFee,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      if (!tournament || !tournament.maxParticipants) return [];

      const [completedCount] = await tx
        .select({ count: count() })
        .from(schema.tournamentParticipants)
        .where(
          and(
            eq(schema.tournamentParticipants.tournamentId, tournamentId),
            eq(schema.tournamentParticipants.teamStatus, 'COMPLETE'),
            eq(schema.tournamentParticipants.isPaid, true),
          ),
        );

      if (completedCount.count >= tournament.maxParticipants) {
        const pendingParts = await tx
          .select()
          .from(schema.tournamentParticipants)
          .where(
            and(
              eq(schema.tournamentParticipants.tournamentId, tournamentId),
              eq(schema.tournamentParticipants.teamStatus, 'PENDING_APPROVAL'),
            ),
          );

        if (pendingParts.length === 0) return [];

        const canceledLeaders: Array<{
          leaderId: string;
          divisionId: string | null;
        }> = [];

        for (const p of pendingParts) {
          const [kicked] = await tx
            .update(schema.tournamentParticipants)
            .set({ teamStatus: 'KICKED', teamInviteToken: null })
            .where(
              and(
                eq(schema.tournamentParticipants.id, p.id),
                eq(
                  schema.tournamentParticipants.teamStatus,
                  'PENDING_APPROVAL',
                ),
              ),
            )
            .returning({ id: schema.tournamentParticipants.id });
          if (!kicked) continue;

          await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
            tx,
            tournamentId,
            p.id,
            'REGISTRATION_CANCELLED_TOURNAMENT_FULL',
          );

          const completedPayment =
            await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
              tx,
              tournamentId,
              p.id,
            );
          if (
            completedPayment &&
            completedPayment.refundStatus === null &&
            Number(completedPayment.refundableAmount) > 0
          ) {
            const refundQuote = calculateTournamentRefundQuote({
              amount: completedPayment.amount,
              platformFeeAmount: completedPayment.platformFeeAmount,
              refundedAmount: completedPayment.refundedAmount,
              registeredAt: p.registeredAt,
              requestedAt: new Date(),
              trigger: 'KICKED',
            });
            if (Number(refundQuote.refundAmount) > 0) {
              const [profile] = await tx
                .select({
                  bankName: schema.profiles.bankName,
                  bankAccountNumber: schema.profiles.bankAccountNumber,
                  bankAccountName: schema.profiles.bankAccountName,
                })
                .from(schema.profiles)
                .where(eq(schema.profiles.userId, completedPayment.userId))
                .limit(1);
              await this.tournamentPaymentRepository.createPendingRefund(tx, {
                paymentId: completedPayment.id,
                amount: refundQuote.refundAmount,
                reason: refundQuote.reason,
                requestedBy: null,
                bankName: profile?.bankName ?? undefined,
                bankAccountNumber: profile?.bankAccountNumber ?? undefined,
                bankAccountName: profile?.bankAccountName ?? undefined,
              });
            }
          }

          canceledLeaders.push({
            leaderId: p.registeredBy,
            divisionId: p.tournamentDivisionId,
          });
        }
        return canceledLeaders;
      }
      return [];
    });
  }
  async processPendingRegistrationsTimeout(): Promise<
    Array<{
      leaderId: string;
      tournamentId: string;
      tournamentName: string;
      divisionId: string | null;
    }>
  > {
    return await this.db.transaction(async (tx) => {
      const timeoutThreshold = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

      const expiredParts = await tx
        .select({
          participant: schema.tournamentParticipants,
          tournament: schema.tournaments,
        })
        .from(schema.tournamentParticipants)
        .innerJoin(
          schema.tournaments,
          eq(schema.tournamentParticipants.tournamentId, schema.tournaments.id),
        )
        .where(
          and(
            eq(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'),
            // Organizer-pairing registrations intentionally remain in the
            // queue until the organizer assigns a teammate. Only self-invite
            // rows carry a token and are eligible for the timeout cleanup.
            isNotNull(schema.tournamentParticipants.teamInviteToken),
            lt(schema.tournamentParticipants.registeredAt, timeoutThreshold),
          ),
        );

      if (expiredParts.length === 0) return [];

      const results: Array<{
        leaderId: string;
        tournamentId: string;
        tournamentName: string;
        divisionId: string | null;
      }> = [];

      for (const { participant, tournament } of expiredParts) {
        const [kicked] = await tx
          .update(schema.tournamentParticipants)
          .set({ teamStatus: 'KICKED', teamInviteToken: null })
          .where(
            and(
              eq(schema.tournamentParticipants.id, participant.id),
              eq(schema.tournamentParticipants.teamStatus, 'PENDING_PARTNER'),
            ),
          )
          .returning({ id: schema.tournamentParticipants.id });
        if (!kicked) continue;

        await this.tournamentPaymentRepository.invalidatePendingParticipantPayments(
          tx,
          tournament.id,
          participant.id,
          'PARTNER_JOIN_TIMEOUT',
        );

        const completedPayment =
          await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
            tx,
            tournament.id,
            participant.id,
          );
        if (
          completedPayment &&
          completedPayment.refundStatus === null &&
          Number(completedPayment.refundableAmount) > 0
        ) {
          const refundQuote = calculateTournamentRefundQuote({
            amount: completedPayment.amount,
            platformFeeAmount: completedPayment.platformFeeAmount,
            refundedAmount: completedPayment.refundedAmount,
            registeredAt: participant.registeredAt,
            requestedAt: new Date(),
            trigger: 'KICKED',
          });
          if (Number(refundQuote.refundAmount) > 0) {
            const [profile] = await tx
              .select({
                bankName: schema.profiles.bankName,
                bankAccountNumber: schema.profiles.bankAccountNumber,
                bankAccountName: schema.profiles.bankAccountName,
              })
              .from(schema.profiles)
              .where(eq(schema.profiles.userId, completedPayment.userId))
              .limit(1);
            await this.tournamentPaymentRepository.createPendingRefund(tx, {
              paymentId: completedPayment.id,
              amount: refundQuote.refundAmount,
              reason: refundQuote.reason,
              requestedBy: null,
              bankName: profile?.bankName ?? undefined,
              bankAccountNumber: profile?.bankAccountNumber ?? undefined,
              bankAccountName: profile?.bankAccountName ?? undefined,
            });
          }
        }

        results.push({
          leaderId: participant.registeredBy,
          tournamentId: tournament.id,
          tournamentName: tournament.name,
          divisionId: participant.tournamentDivisionId,
        });
      }

      return results;
    });
  }
  /**
   * Promote first WAITLISTED participant to the next valid ready state when a slot opens up.
   * Skill: BE Skill 6 (Domain Logic) — waitlist tự động
   */
  private async promoteNextWaitlisted(
    tx: Transaction,
    tournamentId: string,
    divisionId?: string,
  ) {
    const divisionFilter = divisionId
      ? eq(schema.tournamentParticipants.tournamentDivisionId, divisionId)
      : undefined;

    const [nextWaitlisted] = await tx
      .select()
      .from(schema.tournamentParticipants)
      .where(
        and(
          eq(schema.tournamentParticipants.tournamentId, tournamentId),
          eq(schema.tournamentParticipants.teamStatus, 'WAITLISTED'),
          ...(divisionFilter ? [divisionFilter] : []),
        ),
      )
      .orderBy(asc(schema.tournamentParticipants.registeredAt))
      .limit(1);

    if (nextWaitlisted) {
      const [tournament] = await tx
        .select({
          id: schema.tournaments.id,
          matchType: schema.tournaments.matchType,
          entryFee: schema.tournaments.entryFee,
          tournamentConfig: schema.tournaments.tournamentConfig,
        })
        .from(schema.tournaments)
        .where(eq(schema.tournaments.id, tournamentId))
        .limit(1);

      const [division] = nextWaitlisted.tournamentDivisionId
        ? await tx
            .select({ matchType: schema.tournamentDivisions.matchType })
            .from(schema.tournamentDivisions)
            .where(
              eq(
                schema.tournamentDivisions.id,
                nextWaitlisted.tournamentDivisionId,
              ),
            )
            .limit(1)
        : [null];

      const [rosterCount] = await tx
        .select({ count: count() })
        .from(schema.tournamentRosters)
        .where(eq(schema.tournamentRosters.participantId, nextWaitlisted.id));

      const matchType = division?.matchType ?? tournament?.matchType ?? null;
      const isDoubles = this.isDoublesMatchType(matchType);
      const isDoublesPairing =
        isDoubles &&
        !nextWaitlisted.footballTeamId &&
        !resolveFootballTeamConfig(tournament?.tournamentConfig).isTeamSport;
      const entryFeeAmount =
        nextWaitlisted.entryFeeAtRegistration !== null &&
        nextWaitlisted.entryFeeAtRegistration !== undefined
          ? Number(nextWaitlisted.entryFeeAtRegistration)
          : await this.tournamentPaymentRepository.resolveDivisionEntryFee(
              tx,
              tournament ?? { entryFee: null },
              nextWaitlisted.tournamentDivisionId,
            );

      const promotionConfig = (tournament?.tournamentConfig || {}) as Record<
        string,
        unknown
      >;
      const regMode =
        promotionConfig.isLite === true
          ? 'OPEN'
          : promotionConfig.registrationMode === 'APPROVAL'
            ? 'APPROVAL'
            : 'OPEN';
      const promotionPairingMode =
        promotionConfig.doublesPairingMode === 'SELF' ? 'SELF' : 'ORGANIZER';
      const promotedStatus = isDoublesPairing
        ? resolveDoublesParticipantStatus({
            event: 'REGISTER',
            registrationMode: regMode,
            waitlisted: false,
            pairingMode: promotionPairingMode,
            rosterCount: Number(rosterCount.count),
            hasPartnerInvite: Boolean(nextWaitlisted.teamInviteToken),
          })
        : regMode === 'APPROVAL'
          ? 'PENDING_APPROVAL'
          : 'COMPLETE';

      const [promoted] = await tx
        .update(schema.tournamentParticipants)
        .set({
          teamStatus: promotedStatus,
          isPaid: nextWaitlisted.isPaid || entryFeeAmount === 0,
        })
        .where(eq(schema.tournamentParticipants.id, nextWaitlisted.id))
        .returning();
      return promoted;
    }
    return null;
  }
}
