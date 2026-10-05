import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import { AuditService } from '../../audit/audit.service';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentPaymentRepository } from '../repositories/tournament-payment.repository';
import { TournamentAccessService } from './tournament-access.service';
import { NotificationsService } from '../../notifications/notifications.service';
import {
  buildParticipantOrganizerPairingPendingNotification,
  buildParticipantRegistrationRejectedNotification,
  buildParticipantRegistrationSuccessNotification,
} from '../../notifications/notification-builder';
import type { RosterImportPreviewDto } from '../dto/roster-import-preview.dto';
import { isLiteRegistrationTournament } from '../utils/registration-payment-eligibility';
import { resolveDoublesParticipantStatus } from '../utils/tournament-participant-status';
import { calculateTournamentRefundQuote } from '../utils/tournament-refund-policy';

export type RegistrationChanged = (
  tournamentId: string,
  payload: {
    participantId?: string;
    divisionId?: string | null;
    action: string;
  },
) => void;

@Injectable()
export class TournamentParticipantAdminService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly tournamentAccessService: TournamentAccessService,
    private readonly notificationsService: NotificationsService,
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly auditService: AuditService,
    private readonly tournamentPaymentRepository: TournamentPaymentRepository,
  ) {}

  async previewRosterImport(
    tournamentId: string,
    userId: string,
    systemRoles: string[],
    dto: RosterImportPreviewDto,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(
      tournament,
      userId,
      systemRoles,
    );
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền xem trước danh sách VĐV',
      );
    }

    if (tournament.status === 'COMPLETED') {
      throw new BadRequestException('Giải đấu đã kết thúc');
    }
    if (
      tournament.status === 'REGISTRATION_CLOSED' ||
      tournament.isRegistrationLocked
    ) {
      throw new BadRequestException(
        'Đăng ký đã được khóa. Không thể nhập thêm VĐV.',
      );
    }

    return this.tournamentsRepository.previewRosterImport(tournamentId, dto);
  }
  async seedMockParticipants(
    tournamentId: string,
    userId: string,
    names: string[],
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể tạo dữ liệu ảo khi giải đấu ở trạng thái Nháp hoặc Mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền tạo dữ liệu ảo');
    }

    return this.tournamentsRepository.seedMockParticipants(
      tournamentId,
      names,
      divisionId,
    );
  }

  async clearMockParticipants(
    tournamentId: string,
    userId: string,
    systemRoles: string[] = [],
    divisionId?: string,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể xóa dữ liệu ảo ở trạng thái Nháp hoặc Đang mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa dữ liệu ảo');
    }

    return this.tournamentsRepository.clearMockParticipants(
      tournamentId,
      divisionId,
    );
  }

  async deleteMockParticipant(
    tournamentId: string,
    participantId: string,
    userId: string,
    systemRoles: string[] = [],
    broadcastRegistrationChanged: RegistrationChanged,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isLite =
      (
        tournament.tournamentConfig as
          | Record<string, unknown>
          | null
          | undefined
      )?.isLite === true;
    if (
      tournament.status !== 'DRAFT' &&
      !isLite &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ có thể xoá dữ liệu giả lập ở trạng thái Nháp hoặc Đang mở đăng ký.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa người tham gia ảo');
    }

    const result = await this.tournamentsRepository.deleteMockParticipant(
      tournamentId,
      participantId,
    );
    broadcastRegistrationChanged(tournamentId, {
      participantId,
      action: 'PARTICIPANT_REMOVED',
    });
    return result;
  }
  async updateParticipantStatus(
    tournamentId: string,
    participantId: string,
    status: string,
    userId: string,
    systemRoles: string[] = [],
    broadcastRegistrationChanged: RegistrationChanged,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    if (tournament.status !== 'REGISTRATION_OPEN') {
      throw new BadRequestException(
        'Giải đấu đã chốt danh sách, không thể duyệt hoặc từ chối vận động viên.',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền cập nhật trạng thái');
    }

    if (status !== 'COMPLETE' && status !== 'REJECTED') {
      throw new BadRequestException(
        'Chỉ hỗ trợ duyệt hoặc từ chối hồ sơ đăng ký.',
      );
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }

    if (participant.teamStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException(
        'Chỉ hồ sơ đang chờ duyệt mới được phép duyệt hoặc từ chối.',
      );
    }

    let nextStatus = status;
    let participantRosters: Array<{ userId: string }> | null = null;
    const tournamentConfig = (tournament.tournamentConfig || {}) as Record<
      string,
      unknown
    >;
    if (status === 'COMPLETE') {
      const division = participant.tournamentDivisionId
        ? await this.tournamentsRepository.findDivisionById(
            participant.tournamentDivisionId,
          )
        : null;
      participantRosters =
        await this.tournamentsRepository.getParticipantRosters(participantId);
      const matchType = division?.matchType ?? tournament.matchType;
      nextStatus = resolveDoublesParticipantStatus({
        event: 'APPROVE',
        registrationMode: tournamentConfig.registrationMode,
        isDoubles:
          matchType === 'DOUBLES' || matchType === 'MIXED_DOUBLES',
        rosterCount: participantRosters.length,
        isLite: isLiteRegistrationTournament(tournamentConfig),
        pairingMode:
          tournamentConfig.doublesPairingMode === 'SELF' ? 'SELF' : 'ORGANIZER',
        hasPartnerInvite: Boolean(participant.teamInviteToken),
      });

      if (nextStatus === 'COMPLETE') {
        if (!participant.isPaid) {
          const completedPayment =
            await this.tournamentsRepository.findCompletedParticipantPayment(
              participant.id,
            );
          if (completedPayment) {
            await this.tournamentsRepository.markParticipantPaid(participant.id);
            participant.isPaid = true;
          }
        }

        const entryFeeAmount =
          participant.entryFeeAtRegistration != null
            ? Number(participant.entryFeeAtRegistration)
            : division?.entryFeeOverrideEnabled === true &&
                division.entryFee != null
              ? Number(division.entryFee)
              : Number(tournament.entryFee ?? 0);

        if (entryFeeAmount > 0 && !participant.isPaid) {
          throw new BadRequestException(
            'Hồ sơ có lệ phí chưa thanh toán, không thể duyệt hoàn tất.',
          );
        }
      }
    }

    let updated = await this.tournamentsRepository.updateParticipantStatus(
      participantId,
      nextStatus,
      'PENDING_APPROVAL',
    );
    if (!updated) {
      throw new BadRequestException(
        'Hồ sơ không còn ở trạng thái chờ Ban tổ chức duyệt.',
      );
    }

    if (nextStatus === 'COMPLETE') {
      try {
        updated =
          (await this.tournamentsRepository.assignNextAvailableSeed(
            tournamentId,
            updated.id,
          )) ?? updated;
      } catch (err) {
        // Approval is already persisted; seed assignment is deliberately
        // best-effort so a transient seed-write failure cannot undo approval.
        console.error(
          'Failed to assign next available seed after participant approval:',
          err,
        );
      }
    }

    try {
      const rosters =
        participantRosters ??
        (await this.tournamentsRepository.getParticipantRosters(participantId));
      for (const roster of rosters) {
        if (nextStatus === 'COMPLETE') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationSuccessNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        } else if (
          nextStatus === 'PENDING_PARTNER' &&
          !participant.teamInviteToken &&
          tournamentConfig.doublesPairingMode !== 'SELF'
        ) {
          await this.notificationsService.sendNotification(
            buildParticipantOrganizerPairingPendingNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        } else if (status === 'REJECTED') {
          await this.notificationsService.sendNotification(
            buildParticipantRegistrationRejectedNotification({
              receiverId: roster.userId,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: updated.tournamentDivisionId,
            }),
          );
        }
      }
    } catch (err) {
      console.error(
        'Failed to send notification for updateParticipantStatus:',
        err,
      );
    }

    broadcastRegistrationChanged(tournamentId, {
      participantId: updated.id,
      divisionId: updated.tournamentDivisionId,
      action: status === 'COMPLETE' ? 'APPROVED' : 'REJECTED',
    });

    return updated;
  }

  async setParticipantFeePaid(
    tournamentId: string,
    participantId: string,
    paid: boolean,
    userId: string,
    systemRoles: string[] = [],
    broadcastRegistrationChanged: RegistrationChanged,
  ) {
    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) throw new NotFoundException('Giải đấu không tồn tại');

    const isAuthorized = await this.tournamentAccessService.isManager(
      tournament,
      userId,
      systemRoles,
    );
    if (!isAuthorized) {
      throw new ForbiddenException(
        'Bạn không có quyền cập nhật trạng thái thanh toán lệ phí',
      );
    }

    const participant =
      await this.tournamentsRepository.findParticipantById(participantId);
    if (!participant || participant.tournamentId !== tournamentId) {
      throw new NotFoundException('Người tham gia không tồn tại');
    }

    // Marking a fee paid is a claim about money that is still being collected,
    // so it is confined to the window where that claim is meaningful, matching
    // addTeamMember's REGISTRATION_OPEN / UPCOMING gate. Clearing the mark is
    // deliberately NOT gated: refunds are raised after the event has run, and
    // blocking them here would make the one case this endpoint exists for
    // impossible.
    if (
      paid &&
      tournament.status !== 'REGISTRATION_OPEN' &&
      tournament.status !== 'UPCOMING'
    ) {
      throw new BadRequestException(
        'Chỉ đánh dấu đã thanh toán khi giải đấu còn trong thời gian đăng ký.',
      );
    }

    if (participant.isPaid === paid) {
      return { participant, refundRequested: false, refundPaymentId: null };
    }

    const result = await this.db.transaction(async (tx) => {
      // Chỉ gỡ cờ khi có giao dịch đã thu thật sự; lệ phí đánh dấu tay thì
      // không có dòng tiền nào cần hoàn.
      const completedPayment = paid
        ? null
        : await this.tournamentPaymentRepository.findCompletedParticipantPaymentInTx(
            tx,
            tournamentId,
            participantId,
          );

      // A refund already raised for this payment must never be raised twice. The
      // CAS inside createPendingRefund would throw and roll the whole flag
      // update back, leaving the checkbox stuck on after a tick/untick/tick
      // cycle. Clearing the mark is still correct; only the request is skipped.
      if (completedPayment && !completedPayment.refundStatus) {
        const refundQuote = calculateTournamentRefundQuote({
          amount: completedPayment.amount,
          platformFeeAmount: completedPayment.platformFeeAmount,
          refundedAmount: completedPayment.refundedAmount,
          registeredAt: participant.registeredAt,
          requestedAt: new Date(),
          trigger: 'KICKED',
        });
        await this.tournamentPaymentRepository.createPendingRefund(tx, {
          paymentId: completedPayment.id,
          amount: refundQuote.refundAmount,
          reason: 'ORGANIZER_UNMARKED_FEE_PAID',
          requestedBy: userId,
        });
        await this.auditService.logUpdate(
          tx,
          userId,
          'payments',
          completedPayment.id,
          {
            refundStatus: completedPayment.refundStatus,
            refundableAmount: completedPayment.refundableAmount,
          },
          {
            refundStatus: 'PENDING_REFUND',
            pendingRefundAmount: refundQuote.refundAmount,
          },
        );
      }

      const updatedParticipant =
        await this.tournamentPaymentRepository.setParticipantPaidInTx(
          tx,
          participantId,
          paid,
        );
      if (!updatedParticipant) {
        throw new NotFoundException('Người tham gia không tồn tại');
      }

      await this.auditService.logUpdate(
        tx,
        userId,
        'tournament_participants',
        participantId,
        participant,
        updatedParticipant,
      );

      // Report what this call actually did: a payment that already carried a
      // refund state did not get a new request out of it.
      const refundRequested = completedPayment !== null && !completedPayment.refundStatus;
      return {
        participant: updatedParticipant,
        refundRequested,
        refundPaymentId: refundRequested ? completedPayment!.id : null,
      };
    });

    broadcastRegistrationChanged(tournamentId, {
      participantId: result.participant.id,
      divisionId: result.participant.tournamentDivisionId,
      action: 'FEE_PAYMENT_UPDATED',
    });

    return result;
  }
}
