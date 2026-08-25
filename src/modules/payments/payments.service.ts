import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import { randomInt, randomUUID, timingSafeEqual } from 'crypto';
import {
  calcPlatformFee,
  DEFAULT_PLATFORM_FEE_RULE,
  type PlatformFeeRule,
} from '../../common/helpers/platform-fee.helper';
import {
  buildOrganizerPaymentCompletedNotification,
  buildParticipantPaymentCompletedNotification,
  buildPayoutReviewedNotification,
  buildTournamentPublishApprovedNotification,
} from '../notifications/notification-builder';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePaymentDto, PaymentPurpose } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import type { PayoutReviewStatus } from './dto/review-payout.dto';
import { WebhookDto } from './dto/webhook.dto';
import { PaymentsRepository } from './payments.repository';
import { RegistrationLockService } from '../tournaments/registration-lock.service';

interface CalculatedPayment {
  amount: number;
  platformFeeAmount: number;
  participantId?: string;
  divisionId?: string;
}

const payoutExpectedStatuses: Record<PayoutReviewStatus, string[]> = {
  UNDER_REVIEW: ['REQUESTED', 'PENDING'],
  APPROVED: ['UNDER_REVIEW'],
  PROCESSING: ['APPROVED'],
  PAID: ['PROCESSING'],
  REJECTED: ['REQUESTED', 'PENDING', 'UNDER_REVIEW'],
};

@Injectable()
export class PaymentsService {
  private readonly payos: PayOS | null;

  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly registrationLockService: RegistrationLockService,
  ) {
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
    const apiKey = this.configService.get<string>('PAYOS_API_KEY');
    const checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');
    this.payos =
      clientId && apiKey && checksumKey
        ? new PayOS({ clientId, apiKey, checksumKey })
        : null;
  }

  async createPaymentLink(
    userId: string,
    data: CreatePaymentDto,
    clientIdempotencyKey?: string,
  ) {
    if (!this.payos) {
      throw new ServiceUnavailableException('Máy chủ chưa cấu hình PayOS.');
    }

    const tournament = await this.paymentsRepository.findTournamentById(
      data.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Không tìm thấy giải đấu.');

    const calculated = await this.calculatePayment(userId, data, tournament);
    const reusable = await this.paymentsRepository.findReusablePayment(
      userId,
      data.purpose,
      data.tournamentId,
      calculated.participantId,
    );
    if (reusable?.providerOrderCode) {
      try {
        const existing = await this.payos.paymentRequests.get(
          Number(reusable.providerOrderCode),
        );
        const existingLink = existing as unknown as {
          status?: string | null;
          checkoutUrl?: string | null;
          qrCode?: string | null;
          expiredAt?: number | string | null;
        };
        const remoteStatus = String(existingLink.status || '').toUpperCase();
        const remoteExpiredAt = Number(existingLink.expiredAt ?? 0);
        const remotelyExpired =
          Number.isFinite(remoteExpiredAt) &&
          remoteExpiredAt > 0 &&
          remoteExpiredAt * 1000 <= Date.now();
        const hasUsableLink = Boolean(
          existingLink.checkoutUrl || existingLink.qrCode,
        );

        if (
          !remotelyExpired &&
          hasUsableLink &&
          (!remoteStatus || ['PENDING', 'PROCESSING'].includes(remoteStatus))
        ) {
          return {
            paymentId: reusable.id,
            orderCode: Number(reusable.providerOrderCode),
            paymentUrl: existingLink.checkoutUrl ?? null,
            qrCode: existingLink.qrCode ?? undefined,
            status: reusable.status,
            amount: Number(reusable.amount),
            purpose: reusable.purpose,
            reused: true,
          };
        }
      } catch {
        // Bỏ qua lỗi nếu PayOS không lấy được thông tin link cũ
      }

      if (reusable.purpose === 'REGISTRATION_FEE') {
        await this.registrationLockService.releaseSlot(
          reusable.tournamentId,
          reusable.divisionId ?? undefined,
        );
      }
      await this.paymentsRepository.transitionPayment(
        reusable.id,
        'PENDING',
        'CANCELLED',
        'PAYOS_REUSABLE_LINK_INVALID',
      );
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const idempotencyKey = `${userId}:${clientIdempotencyKey?.trim() || randomUUID()}`;
    if (idempotencyKey.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key không được vượt quá 200 ký tự.',
      );
    }

    // Giữ chỗ slot trên Redis trước khi tạo giao dịch thanh toán
    if (data.purpose === PaymentPurpose.REGISTRATION_FEE) {
      await this.registrationLockService.reserveSlot(
        data.tournamentId,
        calculated.divisionId,
      );
    }

    let payment;
    try {
      payment = await this.paymentsRepository.createPaymentIntent(userId, {
        tournamentId: data.tournamentId,
        participantId: calculated.participantId,
        divisionId: calculated.divisionId,
        purpose: data.purpose,
        amount: calculated.amount,
        platformFeeAmount: calculated.platformFeeAmount,
        idempotencyKey,
        expiresAt,
        serviceName: tournament.name,
      });
    } catch (error: unknown) {
      // Hoàn trả slot nếu tạo hóa đơn lỗi
      if (data.purpose === PaymentPurpose.REGISTRATION_FEE) {
        await this.registrationLockService.releaseSlot(
          data.tournamentId,
          calculated.divisionId,
        );
      }
      throw new BadRequestException(
        this.errorMessage(
          error,
          'Không thể tạo payment intent hoặc yêu cầu đã bị lặp.',
        ),
      );
    }

    const orderCode = Number(
      `${Date.now().toString().slice(-10)}${randomInt(10, 99)}`,
    );
    await this.paymentsRepository.attachPayOSLink(
      payment.id,
      orderCode.toString(),
    );
    const prefix =
      data.purpose === PaymentPurpose.REGISTRATION_FEE ? 'DK' : 'GP';
    const cleanName = tournament.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 23);
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001';

    try {
      const result = await this.payos.paymentRequests.create({
        orderCode,
        amount: calculated.amount,
        description: `${prefix}${cleanName}`.slice(0, 25),
        cancelUrl: `${frontendUrl}/tournaments/${data.tournamentId}?payment_status=cancel&payment_id=${payment.id}`,
        returnUrl: `${frontendUrl}/tournaments/${data.tournamentId}?payment_status=return&payment_id=${payment.id}`,
        expiredAt: Math.floor(expiresAt.getTime() / 1000),
      });
      return {
        paymentId: payment.id,
        orderCode,
        paymentUrl: result.checkoutUrl,
        qrCode: result.qrCode,
        status: payment.status,
        amount: calculated.amount,
        purpose: data.purpose,
        description: `${prefix}${cleanName}`.slice(0, 25),
        expiresAt,
      };
    } catch (error: unknown) {
      if (data.purpose === PaymentPurpose.REGISTRATION_FEE) {
        await this.registrationLockService.releaseSlot(
          data.tournamentId,
          calculated.divisionId,
        );
      }
      await this.paymentsRepository.transitionPayment(
        payment.id,
        'PENDING',
        'FAILED',
        'PAYOS_LINK_CREATION_FAILED',
      );
      throw new BadRequestException(
        this.errorMessage(error, 'Không thể tạo liên kết thanh toán PayOS.'),
      );
    }
  }

  async handleWebhook(payload: WebhookDto) {
    if (!this.payos) {
      throw new ServiceUnavailableException('Máy chủ chưa cấu hình PayOS.');
    }

    let verified;
    try {
      verified = await this.payos.webhooks.verify(payload);
    } catch (error: unknown) {
      throw new BadRequestException(
        this.errorMessage(error, 'Xác thực chữ ký webhook PayOS thất bại.'),
      );
    }

    const payment = await this.paymentsRepository.findPaymentByReference(
      verified.orderCode.toString(),
    );
    if (!payment)
      throw new NotFoundException('Không tìm thấy giao dịch PayOS.');
    if (payment.paymentGateway !== 'PAYOS') {
      throw new BadRequestException('Giao dịch không thuộc cổng PayOS.');
    }
    if (Number(payment.amount) !== verified.amount) {
      throw new BadRequestException(
        'Số tiền webhook không khớp payment intent.',
      );
    }
    const webhookData = this.sanitizeWebhookData(verified);
    const eventKey = `PAYOS:${verified.orderCode}:${verified.reference ?? 'no-reference'}:${verified.code}`;
    await this.paymentsRepository.recordWebhookEvent({
      eventKey,
      paymentId: payment.id,
      providerOrderCode: verified.orderCode.toString(),
      providerTransactionId: verified.reference,
      statusCode: verified.code,
      amount: verified.amount,
      payload: webhookData,
    });
    if (verified.code !== '00') {
      return { accepted: true, completed: false };
    }
    if (payment.status === 'COMPLETED') {
      return { accepted: true, completed: true, idempotent: true };
    }

    const invalidReason = await this.ensurePaymentStillCompletable(payment);
    if (invalidReason) {
      await this.paymentsRepository.transitionPayment(
        payment.id,
        'PENDING',
        'CANCELLED',
        invalidReason,
        webhookData,
        verified.reference,
      );
      if (payment.purpose === 'REGISTRATION_FEE') {
        await this.registrationLockService.releaseSlot(
          payment.tournamentId,
          payment.divisionId ?? undefined,
        );
      }
      return { accepted: true, completed: false, invalidated: true };
    }

    const result = await this.paymentsRepository.transitionPayment(
      payment.id,
      'PENDING',
      'COMPLETED',
      'PAYOS_VERIFIED_WEBHOOK',
      webhookData,
      verified.reference,
    );
    if (!result.payment)
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    if (!result.transitioned) {
      if (result.payment.status === 'COMPLETED') {
        return { accepted: true, completed: true, idempotent: true };
      }
      throw new BadRequestException(
        `Không thể hoàn tất giao dịch từ trạng thái ${result.payment.status}.`,
      );
    }

    if (payment.purpose === 'REGISTRATION_FEE') {
      await this.registrationLockService.confirmSlot(
        payment.tournamentId,
        payment.divisionId ?? undefined,
      );
    }
    await this.paymentsRepository.finalizeReceipt(
      result.payment.id,
      result.payment,
      webhookData,
    );
    await this.afterPaymentCompleted(result.payment);
    return { accepted: true, completed: true, idempotent: false };
  }

  async mockVerify(userId: string, paymentId: string) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const envMockEnabled =
      this.configService.get<string>('ENABLE_MOCK_PAYMENT') === 'true';
    const systemSandboxEnabled =
      (
        await this.paymentsRepository.getConfigValue(
          'PAYMENT_SANDBOX_ENABLED',
          'false',
        )
      )
        .trim()
        .toLowerCase() === 'true';
    if (nodeEnv !== 'test' && (!envMockEnabled || !systemSandboxEnabled)) {
      throw new NotFoundException('Endpoint không tồn tại.');
    }

    const payment = await this.paymentsRepository.findPaymentById(paymentId);
    if (!payment) throw new NotFoundException('Không tìm thấy giao dịch.');
    if (payment.userId !== userId) {
      throw new ForbiddenException(
        'Bạn không có quyền xác minh giao dịch này.',
      );
    }
    if (payment.status === 'COMPLETED') {
      return { completed: true, idempotent: true };
    }

    const invalidReason = await this.ensurePaymentStillCompletable(payment);
    if (invalidReason) {
      await this.paymentsRepository.transitionPayment(
        payment.id,
        'PENDING',
        'CANCELLED',
        invalidReason,
        { mock: true },
        `MOCK_CANCEL_${Date.now()}`,
      );
      if (payment.purpose === 'REGISTRATION_FEE') {
        await this.registrationLockService.releaseSlot(
          payment.tournamentId,
          payment.divisionId ?? undefined,
        );
      }
      throw new BadRequestException(
        'Giao dịch không còn hợp lệ để hoàn tất thanh toán.',
      );
    }

    const result = await this.paymentsRepository.transitionPayment(
      payment.id,
      'PENDING',
      'COMPLETED',
      'TEST_MOCK_VERIFY',
      { mock: true },
      `MOCK_${Date.now()}`,
    );
    if (!result.transitioned && result.payment?.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Giao dịch không còn ở trạng thái chờ thanh toán.',
      );
    }
    if (payment.purpose === 'REGISTRATION_FEE') {
      await this.registrationLockService.confirmSlot(
        payment.tournamentId,
        payment.divisionId ?? undefined,
      );
    }
    return { completed: true, idempotent: !result.transitioned };
  }

  async requestPayout(organizerId: string, data: PayoutRequestDto) {
    const tournament = await this.paymentsRepository.findTournamentById(
      data.tournamentId,
    );
    if (!tournament) throw new NotFoundException('Không tìm thấy giải đấu.');
    if (tournament.createdBy !== organizerId) {
      throw new ForbiddenException(
        'Chỉ chủ sở hữu giải đấu được yêu cầu giải ngân.',
      );
    }
    if (tournament.status !== 'COMPLETED') {
      throw new BadRequestException(
        'Chỉ được giải ngân khi giải đấu đã hoàn thành.',
      );
    }
    try {
      return await this.paymentsRepository.createPayoutRequest(
        organizerId,
        data,
      );
    } catch (error: unknown) {
      throw new BadRequestException(
        this.errorMessage(error, 'Không thể tạo yêu cầu giải ngân.'),
      );
    }
  }

  async findPaymentById(userId: string, id: string) {
    const payment = await this.paymentsRepository.findPaymentById(id);
    if (!payment)
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    if (payment.userId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem giao dịch này.');
    }
    return payment;
  }

  async findPaymentReceipt(userId: string, id: string) {
    const payment = await this.findPaymentById(userId, id);
    const receipt = await this.paymentsRepository.findPaymentReceipt(
      payment.id,
    );
    if (!receipt || payment.status !== 'COMPLETED') {
      throw new NotFoundException('Chung tu chua duoc phat hanh.');
    }
    return receipt;
  }

  async findAdminPaymentReceipt(id: string) {
    const payment = await this.paymentsRepository.findPaymentById(id);
    if (!payment)
      throw new NotFoundException('Không tìm thấy giao dịch thanh toán.');
    const receipt = await this.paymentsRepository.findPaymentReceipt(
      payment.id,
    );
    if (!receipt || payment.status !== 'COMPLETED') {
      throw new NotFoundException(
        'Chứng từ chưa được phát hành cho giao dịch này.',
      );
    }
    return receipt;
  }

  async reviewPayout(
    adminId: string,
    id: string,
    status: PayoutReviewStatus,
    proofUrl?: string,
    note?: string,
  ) {
    if ((status === 'APPROVED' || status === 'PAID') && !proofUrl?.trim()) {
      throw new BadRequestException(
        'Bằng chứng giao dịch là bắt buộc khi duyệt hoặc xác nhận đã trả.',
      );
    }
    const payout = await this.paymentsRepository.findPayoutById(id);
    if (!payout)
      throw new NotFoundException('Không tìm thấy yêu cầu giải ngân.');
    const updated = await this.paymentsRepository.transitionPayout(
      id,
      payoutExpectedStatuses[status],
      status,
      adminId,
      { transactionProofUrl: proofUrl, note },
    );
    if (!updated) {
      throw new BadRequestException(
        `Không thể chuyển yêu cầu từ trạng thái ${payout.status} sang ${status}.`,
      );
    }

    if (status === 'PAID' || status === 'REJECTED') {
      const tournament = await this.paymentsRepository.findTournamentById(
        payout.tournamentId,
      );
      if (tournament) {
        await this.notificationsService.sendNotification(
          buildPayoutReviewedNotification({
            receiverId: payout.organizerId,
            tournamentId: payout.tournamentId,
            tournamentName: tournament.name,
            approved: status === 'PAID',
          }),
        );
      }
    }
    return updated;
  }

  findUserPayments(userId: string) {
    return this.paymentsRepository.findUserPayments(userId);
  }

  findOrganizerPayouts(organizerId: string) {
    return this.paymentsRepository.findOrganizerPayouts(organizerId);
  }

  findAllPayouts() {
    return this.paymentsRepository.findAllPayoutRequests();
  }

  findAllTransactions() {
    return this.paymentsRepository.findAllPayments();
  }

  getStats() {
    return this.paymentsRepository.getAdminStats();
  }

  async confirmRefund(adminId: string, paymentId: string, proofUrl: string) {
    const updated = await this.paymentsRepository.confirmLegacyRefund(
      paymentId,
      adminId,
      proofUrl,
    );
    if (!updated) {
      throw new BadRequestException(
        'Chỉ giao dịch COMPLETED đang PENDING_REFUND mới được xác nhận hoàn tiền.',
      );
    }
    return updated;
  }

  private async calculatePayment(
    userId: string,
    data: CreatePaymentDto,
    tournament: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findTournamentById']>>
    >,
  ): Promise<CalculatedPayment> {
    if (data.purpose === PaymentPurpose.REGISTRATION_FEE) {
      if (!data.participantId) {
        throw new BadRequestException(
          'participantId là bắt buộc với lệ phí đăng ký.',
        );
      }
      const participant = await this.paymentsRepository.findParticipantById(
        data.participantId,
      );
      if (!participant || participant.tournamentId !== tournament.id) {
        throw new BadRequestException('Lượt đăng ký không thuộc giải đấu.');
      }
      if (participant.registeredBy !== userId) {
        throw new ForbiddenException('Bạn không sở hữu lượt đăng ký này.');
      }
      const completedPayment =
        await this.paymentsRepository.findCompletedParticipantPayment(
          participant.id,
        );
      if (completedPayment) {
        throw new BadRequestException('Lượt đăng ký đã thanh toán.');
      }
      if (
        data.divisionId &&
        data.divisionId !== participant.tournamentDivisionId
      ) {
        throw new BadRequestException('divisionId không khớp lượt đăng ký.');
      }
      if (participant.teamStatus !== 'COMPLETE') {
        throw new BadRequestException(
          'Lượt đăng ký phải hoàn tất đủ thành viên trước khi thanh toán.',
        );
      }

      const hasRegistrationFeeSnapshot =
        participant.entryFeeAtRegistration !== null &&
        participant.entryFeeAtRegistration !== undefined;
      let amount = hasRegistrationFeeSnapshot
        ? Number(participant.entryFeeAtRegistration)
        : Number(tournament.entryFee);
      if (!hasRegistrationFeeSnapshot && participant.tournamentDivisionId) {
        const division = await this.paymentsRepository.findDivisionById(
          participant.tournamentDivisionId,
        );
        if (!division || division.tournamentId !== tournament.id) {
          throw new BadRequestException('Hạng mục thi đấu không hợp lệ.');
        }
        amount = Number(division.entryFee);
      }
      // isPaid=true from a paid registration is only trusted together with the
      // positive fee snapshot; a free registration remains free if the current
      // division fee is later increased for new participants.
      if (participant.isPaid && amount > 0) {
        throw new BadRequestException('Lượt đăng ký đã thanh toán.');
      }

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        throw new BadRequestException(
          'Lệ phí đăng ký phải là số nguyên dương.',
        );
      }

      const percentage = this.registrationPlatformFeePercentage(tournament);
      const feeRule = this.registrationPlatformFeeRule(tournament);
      const playerCount = Math.max(
        1,
        await this.paymentsRepository.countParticipantPlayers(participant.id),
      );
      const fee = Math.min(
        amount,
        calcPlatformFee(amount, percentage, feeRule) * playerCount,
      );
      return {
        amount,
        platformFeeAmount: fee,
        participantId: participant.id,
        divisionId: participant.tournamentDivisionId ?? undefined,
      };
    }

    if (data.participantId || data.divisionId) {
      throw new BadRequestException(
        'Phí cấp giải không nhận participantId hoặc divisionId.',
      );
    }
    if (tournament.createdBy !== userId) {
      throw new ForbiddenException(
        'Chỉ chủ giải đấu được thanh toán khoản phí này.',
      );
    }
    this.assertPublishConfiguration(tournament);

    if (data.purpose === PaymentPurpose.TOURNAMENT_PUBLISH_FEE) {
      const amount = await this.publishFee(tournament);
      if (amount <= 0) {
        throw new BadRequestException(
          'Giải đấu này không phát sinh phí công bố.',
        );
      }
      return { amount, platformFeeAmount: amount };
    }

    if (tournament.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException(
        'Phí nền tảng chỉ được thanh toán sau khi chốt đăng ký.',
      );
    }
    // Registration payments already persist the authoritative, division-aware
    // platform fee (including the per-payment cap). Aggregate those completed
    // rows rather than recomputing from the legacy tournament entry fee.
    const amount =
      await this.paymentsRepository.sumCompletedRegistrationPlatformFees(
        tournament.id,
      );
    if (amount <= 0)
      throw new BadRequestException('Không có phí nền tảng cần thanh toán.');
    return { amount, platformFeeAmount: amount };
  }

  private async publishFee(
    tournament: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findTournamentById']>>
    >,
  ): Promise<number> {
    const key =
      tournament.tournamentType === 'PUBLIC'
        ? tournament.isRanked
          ? 'TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED'
          : 'TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED'
        : 'TOURNAMENT_PUBLISH_FEE_CLUB';
    const fallback = '0';
    const amount = Number(
      await this.paymentsRepository.getConfigValue(key, fallback),
    );
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new BadRequestException(`Cấu hình ${key} không hợp lệ.`);
    }
    return amount;
  }

  private registrationPlatformFeePercentage(
    tournament: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findTournamentById']>>
    >,
  ): number {
    // The percentage is snapshotted when the tournament is created. Never read
    // the mutable global default here, otherwise an admin edit changes charges
    // for already-created tournaments while the organizer UI still shows the snapshot.
    const percentage = Number(tournament.platformFeePercentage);
    if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
      throw new BadRequestException(
        'Tỷ lệ phí nền tảng của giải đấu không hợp lệ.',
      );
    }
    return percentage;
  }

  private registrationPlatformFeeRule(
    tournament: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findTournamentById']>>
    >,
  ): PlatformFeeRule {
    const thresholdAmount = Number(tournament.platformFeeThreshold);
    const fixedAmount = Number(tournament.platformFeeFixedAmount);
    if (
      !Number.isSafeInteger(thresholdAmount) ||
      thresholdAmount < 0 ||
      !Number.isSafeInteger(fixedAmount) ||
      fixedAmount < 0
    ) {
      return DEFAULT_PLATFORM_FEE_RULE;
    }
    return { thresholdAmount, fixedAmount };
  }

  private assertPublishConfiguration(
    tournament: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findTournamentById']>>
    >,
  ) {
    if (!tournament.description?.trim()) {
      throw new BadRequestException(
        'Giải đấu phải có mô tả trước khi thanh toán.',
      );
    }
    if (
      !tournament.startDate ||
      !tournament.endDate ||
      !tournament.registrationStartDate ||
      !tournament.registrationEndDate ||
      !tournament.venueId
    ) {
      throw new BadRequestException(
        'Giải đấu chưa cấu hình đủ thời gian và địa điểm.',
      );
    }
  }

  private async afterPaymentCompleted(
    payment: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findPaymentById']>>
    >,
  ) {
    const tournament = await this.paymentsRepository.findTournamentById(
      payment.tournamentId,
    );
    if (!tournament) return;

    try {
      if (payment.purpose === 'REGISTRATION_FEE' && payment.participantId) {
        await this.notificationsService.sendNotification(
          buildParticipantPaymentCompletedNotification({
            receiverId: payment.userId,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
            divisionId: payment.divisionId,
          }),
        );
        if (tournament.createdBy !== payment.userId) {
          await this.notificationsService.sendNotification(
            buildOrganizerPaymentCompletedNotification({
              receiverId: tournament.createdBy,
              tournamentId: tournament.id,
              tournamentName: tournament.name,
              divisionId: payment.divisionId,
            }),
          );
        }
      } else if (payment.purpose === 'TOURNAMENT_PUBLISH_FEE') {
        const nextStatus = 'PENDING_APPROVAL';
        await this.paymentsRepository.setTournamentStatus(
          tournament.id,
          nextStatus,
        );
        await this.notificationsService.sendNotification(
          buildTournamentPublishApprovedNotification({
            receiverId: tournament.createdBy,
            tournamentId: tournament.id,
            tournamentName: tournament.name,
          }),
        );
      } else if (payment.purpose === 'PLATFORM_FEE') {
        await this.paymentsRepository.setTournamentStatus(
          tournament.id,
          'UPCOMING',
        );
      }
    } catch (error: unknown) {
      console.error('Post-payment notification/status update failed:', error);
    }
  }

  private sanitizeWebhookData(
    data: WebhookDto['data'],
  ): Record<string, unknown> {
    return {
      orderCode: data.orderCode,
      amount: data.amount,
      reference: data.reference,
      transactionDateTime: data.transactionDateTime,
      currency: data.currency,
      paymentLinkId: data.paymentLinkId,
      code: data.code,
      desc: data.desc,
    };
  }

  private async ensurePaymentStillCompletable(
    payment: NonNullable<
      Awaited<ReturnType<PaymentsRepository['findPaymentById']>>
    >,
  ): Promise<string | null> {
    if (payment.purpose !== 'REGISTRATION_FEE' || !payment.participantId) {
      return null;
    }

    const participant = await this.paymentsRepository.findParticipantById(
      payment.participantId,
    );
    if (!participant || participant.tournamentId !== payment.tournamentId) {
      return 'PARTICIPANT_NOT_FOUND';
    }
    if (participant.registeredBy !== payment.userId) {
      return 'PARTICIPANT_OWNER_MISMATCH';
    }
    if (participant.isPaid) {
      return 'PARTICIPANT_ALREADY_PAID';
    }
    if (
      payment.divisionId &&
      payment.divisionId !== participant.tournamentDivisionId
    ) {
      return 'PARTICIPANT_DIVISION_MISMATCH';
    }
    if (participant.teamStatus !== 'COMPLETE') {
      return `PARTICIPANT_STATUS_${participant.teamStatus}`;
    }

    return null;
  }

  private secretsMatch(expected: string, supplied: string): boolean {
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    return (
      expectedBuffer.length === suppliedBuffer.length &&
      timingSafeEqual(expectedBuffer, suppliedBuffer)
    );
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }
}
