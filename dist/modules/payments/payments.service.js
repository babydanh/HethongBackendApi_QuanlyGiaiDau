"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const node_1 = require("@payos/node");
const crypto_1 = require("crypto");
const platform_fee_helper_1 = require("../../common/helpers/platform-fee.helper");
const notification_builder_1 = require("../notifications/notification-builder");
const notifications_service_1 = require("../notifications/notifications.service");
const create_payment_dto_1 = require("./dto/create-payment.dto");
const payments_repository_1 = require("./payments.repository");
const registration_lock_service_1 = require("../tournaments/registration-lock.service");
const payoutExpectedStatuses = {
    UNDER_REVIEW: ['REQUESTED', 'PENDING'],
    APPROVED: ['UNDER_REVIEW'],
    PROCESSING: ['APPROVED'],
    PAID: ['PROCESSING'],
    REJECTED: ['REQUESTED', 'PENDING', 'UNDER_REVIEW'],
};
let PaymentsService = class PaymentsService {
    paymentsRepository;
    notificationsService;
    configService;
    registrationLockService;
    payos;
    constructor(paymentsRepository, notificationsService, configService, registrationLockService) {
        this.paymentsRepository = paymentsRepository;
        this.notificationsService = notificationsService;
        this.configService = configService;
        this.registrationLockService = registrationLockService;
        const clientId = this.configService.get('PAYOS_CLIENT_ID');
        const apiKey = this.configService.get('PAYOS_API_KEY');
        const checksumKey = this.configService.get('PAYOS_CHECKSUM_KEY');
        this.payos = clientId && apiKey && checksumKey
            ? new node_1.PayOS({ clientId, apiKey, checksumKey })
            : null;
    }
    async createPaymentLink(userId, data, clientIdempotencyKey) {
        if (!this.payos) {
            throw new common_1.ServiceUnavailableException('Máy chủ chưa cấu hình PayOS.');
        }
        const tournament = await this.paymentsRepository.findTournamentById(data.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Không tìm thấy giải đấu.');
        const calculated = await this.calculatePayment(userId, data, tournament);
        const reusable = await this.paymentsRepository.findReusablePayment(userId, data.purpose, data.tournamentId, calculated.participantId);
        if (reusable?.providerOrderCode) {
            try {
                const existing = await this.payos.paymentRequests.get(Number(reusable.providerOrderCode));
                const existingLink = existing;
                const remoteStatus = String(existingLink.status || '').toUpperCase();
                const remoteExpiredAt = Number(existingLink.expiredAt ?? 0);
                const remotelyExpired = Number.isFinite(remoteExpiredAt) &&
                    remoteExpiredAt > 0 &&
                    remoteExpiredAt * 1000 <= Date.now();
                const hasUsableLink = Boolean(existingLink.checkoutUrl || existingLink.qrCode);
                if (!remotelyExpired &&
                    hasUsableLink &&
                    (!remoteStatus || ['PENDING', 'PROCESSING'].includes(remoteStatus))) {
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
            }
            catch {
            }
            if (reusable.purpose === 'REGISTRATION_FEE') {
                await this.registrationLockService.releaseSlot(reusable.tournamentId, reusable.divisionId ?? undefined);
            }
            await this.paymentsRepository.transitionPayment(reusable.id, 'PENDING', 'CANCELLED', 'PAYOS_REUSABLE_LINK_INVALID');
        }
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const idempotencyKey = `${userId}:${clientIdempotencyKey?.trim() || (0, crypto_1.randomUUID)()}`;
        if (idempotencyKey.length > 255) {
            throw new common_1.BadRequestException('Idempotency-Key không được vượt quá 200 ký tự.');
        }
        if (data.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE) {
            await this.registrationLockService.reserveSlot(data.tournamentId, calculated.divisionId);
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
        }
        catch (error) {
            if (data.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE) {
                await this.registrationLockService.releaseSlot(data.tournamentId, calculated.divisionId);
            }
            throw new common_1.BadRequestException(this.errorMessage(error, 'Không thể tạo payment intent hoặc yêu cầu đã bị lặp.'));
        }
        const orderCode = Number(`${Date.now().toString().slice(-10)}${(0, crypto_1.randomInt)(10, 99)}`);
        await this.paymentsRepository.attachPayOSLink(payment.id, orderCode.toString());
        const prefix = data.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE ? 'DK' : 'GP';
        const cleanName = tournament.name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 23);
        const frontendUrl = this.configService.get('FRONTEND_URL') ?? 'http://localhost:3001';
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
        }
        catch (error) {
            if (data.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE) {
                await this.registrationLockService.releaseSlot(data.tournamentId, calculated.divisionId);
            }
            await this.paymentsRepository.transitionPayment(payment.id, 'PENDING', 'FAILED', 'PAYOS_LINK_CREATION_FAILED');
            throw new common_1.BadRequestException(this.errorMessage(error, 'Không thể tạo liên kết thanh toán PayOS.'));
        }
    }
    async handleWebhook(payload) {
        if (!this.payos) {
            throw new common_1.ServiceUnavailableException('Máy chủ chưa cấu hình PayOS.');
        }
        let verified;
        try {
            verified = await this.payos.webhooks.verify(payload);
        }
        catch (error) {
            throw new common_1.BadRequestException(this.errorMessage(error, 'Xác thực chữ ký webhook PayOS thất bại.'));
        }
        const payment = await this.paymentsRepository.findPaymentByReference(verified.orderCode.toString());
        if (!payment)
            throw new common_1.NotFoundException('Không tìm thấy giao dịch PayOS.');
        if (payment.paymentGateway !== 'PAYOS') {
            throw new common_1.BadRequestException('Giao dịch không thuộc cổng PayOS.');
        }
        if (Number(payment.amount) !== verified.amount) {
            throw new common_1.BadRequestException('Số tiền webhook không khớp payment intent.');
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
            await this.paymentsRepository.transitionPayment(payment.id, 'PENDING', 'CANCELLED', invalidReason, webhookData, verified.reference);
            if (payment.purpose === 'REGISTRATION_FEE') {
                await this.registrationLockService.releaseSlot(payment.tournamentId, payment.divisionId ?? undefined);
            }
            return { accepted: true, completed: false, invalidated: true };
        }
        const result = await this.paymentsRepository.transitionPayment(payment.id, 'PENDING', 'COMPLETED', 'PAYOS_VERIFIED_WEBHOOK', webhookData, verified.reference);
        if (!result.payment)
            throw new common_1.NotFoundException('Không tìm thấy giao dịch thanh toán.');
        if (!result.transitioned) {
            if (result.payment.status === 'COMPLETED') {
                return { accepted: true, completed: true, idempotent: true };
            }
            throw new common_1.BadRequestException(`Không thể hoàn tất giao dịch từ trạng thái ${result.payment.status}.`);
        }
        if (payment.purpose === 'REGISTRATION_FEE') {
            await this.registrationLockService.confirmSlot(payment.tournamentId, payment.divisionId ?? undefined);
        }
        await this.paymentsRepository.finalizeReceipt(result.payment.id, result.payment, webhookData);
        await this.afterPaymentCompleted(result.payment);
        return { accepted: true, completed: true, idempotent: false };
    }
    async mockVerify(paymentId, suppliedSecret) {
        const nodeEnv = this.configService.get('NODE_ENV');
        const enabled = this.configService.get('ENABLE_MOCK_PAYMENT') === 'true';
        if (nodeEnv !== 'test' && !enabled) {
            throw new common_1.NotFoundException('Endpoint không tồn tại.');
        }
        if (nodeEnv !== 'test') {
            const configuredSecret = this.configService.get('MOCK_PAYMENT_SECRET');
            if (!configuredSecret || !suppliedSecret || !this.secretsMatch(configuredSecret, suppliedSecret)) {
                throw new common_1.ForbiddenException('Mock payment secret không hợp lệ.');
            }
        }
        const payment = await this.paymentsRepository.findPaymentById(paymentId);
        if (!payment)
            throw new common_1.NotFoundException('Không tìm thấy giao dịch.');
        if (payment.status === 'COMPLETED') {
            return { completed: true, idempotent: true };
        }
        const invalidReason = await this.ensurePaymentStillCompletable(payment);
        if (invalidReason) {
            await this.paymentsRepository.transitionPayment(payment.id, 'PENDING', 'CANCELLED', invalidReason, { mock: true }, `MOCK_CANCEL_${Date.now()}`);
            if (payment.purpose === 'REGISTRATION_FEE') {
                await this.registrationLockService.releaseSlot(payment.tournamentId, payment.divisionId ?? undefined);
            }
            throw new common_1.BadRequestException('Giao dịch không còn hợp lệ để hoàn tất thanh toán.');
        }
        const result = await this.paymentsRepository.transitionPayment(payment.id, 'PENDING', 'COMPLETED', 'TEST_MOCK_VERIFY', { mock: true }, `MOCK_${Date.now()}`);
        if (!result.transitioned && result.payment?.status !== 'COMPLETED') {
            throw new common_1.BadRequestException('Giao dịch không còn ở trạng thái chờ thanh toán.');
        }
        if (payment.purpose === 'REGISTRATION_FEE') {
            await this.registrationLockService.confirmSlot(payment.tournamentId, payment.divisionId ?? undefined);
        }
        return { completed: true, idempotent: !result.transitioned };
    }
    async requestPayout(organizerId, data) {
        const tournament = await this.paymentsRepository.findTournamentById(data.tournamentId);
        if (!tournament)
            throw new common_1.NotFoundException('Không tìm thấy giải đấu.');
        if (tournament.createdBy !== organizerId) {
            throw new common_1.ForbiddenException('Chỉ chủ sở hữu giải đấu được yêu cầu giải ngân.');
        }
        if (tournament.status !== 'COMPLETED') {
            throw new common_1.BadRequestException('Chỉ được giải ngân khi giải đấu đã hoàn thành.');
        }
        try {
            return await this.paymentsRepository.createPayoutRequest(organizerId, data);
        }
        catch (error) {
            throw new common_1.BadRequestException(this.errorMessage(error, 'Không thể tạo yêu cầu giải ngân.'));
        }
    }
    async findPaymentById(userId, id) {
        const payment = await this.paymentsRepository.findPaymentById(id);
        if (!payment)
            throw new common_1.NotFoundException('Không tìm thấy giao dịch thanh toán.');
        if (payment.userId !== userId) {
            throw new common_1.ForbiddenException('Bạn không có quyền xem giao dịch này.');
        }
        return payment;
    }
    async findPaymentReceipt(userId, id) {
        const payment = await this.findPaymentById(userId, id);
        const receipt = await this.paymentsRepository.findPaymentReceipt(payment.id);
        if (!receipt || payment.status !== 'COMPLETED') {
            throw new common_1.NotFoundException('Chung tu chua duoc phat hanh.');
        }
        return receipt;
    }
    async findAdminPaymentReceipt(id) {
        const payment = await this.paymentsRepository.findPaymentById(id);
        if (!payment)
            throw new common_1.NotFoundException('Không tìm thấy giao dịch thanh toán.');
        const receipt = await this.paymentsRepository.findPaymentReceipt(payment.id);
        if (!receipt || payment.status !== 'COMPLETED') {
            throw new common_1.NotFoundException('Chứng từ chưa được phát hành cho giao dịch này.');
        }
        return receipt;
    }
    async reviewPayout(adminId, id, status, proofUrl, note) {
        if ((status === 'APPROVED' || status === 'PAID') && !proofUrl?.trim()) {
            throw new common_1.BadRequestException('Bằng chứng giao dịch là bắt buộc khi duyệt hoặc xác nhận đã trả.');
        }
        const payout = await this.paymentsRepository.findPayoutById(id);
        if (!payout)
            throw new common_1.NotFoundException('Không tìm thấy yêu cầu giải ngân.');
        const updated = await this.paymentsRepository.transitionPayout(id, payoutExpectedStatuses[status], status, adminId, { transactionProofUrl: proofUrl, note });
        if (!updated) {
            throw new common_1.BadRequestException(`Không thể chuyển yêu cầu từ trạng thái ${payout.status} sang ${status}.`);
        }
        if (status === 'PAID' || status === 'REJECTED') {
            const tournament = await this.paymentsRepository.findTournamentById(payout.tournamentId);
            if (tournament) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildPayoutReviewedNotification)({
                    receiverId: payout.organizerId,
                    tournamentId: payout.tournamentId,
                    tournamentName: tournament.name,
                    approved: status === 'PAID',
                }));
            }
        }
        return updated;
    }
    findUserPayments(userId) {
        return this.paymentsRepository.findUserPayments(userId);
    }
    findOrganizerPayouts(organizerId) {
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
    async confirmRefund(adminId, paymentId, proofUrl) {
        const updated = await this.paymentsRepository.confirmLegacyRefund(paymentId, adminId, proofUrl);
        if (!updated) {
            throw new common_1.BadRequestException('Chỉ giao dịch COMPLETED đang PENDING_REFUND mới được xác nhận hoàn tiền.');
        }
        return updated;
    }
    async calculatePayment(userId, data, tournament) {
        if (data.purpose === create_payment_dto_1.PaymentPurpose.REGISTRATION_FEE) {
            if (!data.participantId) {
                throw new common_1.BadRequestException('participantId là bắt buộc với lệ phí đăng ký.');
            }
            const participant = await this.paymentsRepository.findParticipantById(data.participantId);
            if (!participant || participant.tournamentId !== tournament.id) {
                throw new common_1.BadRequestException('Lượt đăng ký không thuộc giải đấu.');
            }
            if (participant.registeredBy !== userId) {
                throw new common_1.ForbiddenException('Bạn không sở hữu lượt đăng ký này.');
            }
            if (participant.isPaid)
                throw new common_1.BadRequestException('Lượt đăng ký đã thanh toán.');
            if (data.divisionId && data.divisionId !== participant.tournamentDivisionId) {
                throw new common_1.BadRequestException('divisionId không khớp lượt đăng ký.');
            }
            if (!['COMPLETE', 'PENDING_APPROVAL'].includes(participant.teamStatus)) {
                throw new common_1.BadRequestException('Lượt đăng ký chưa ở trạng thái hợp lệ để thanh toán.');
            }
            let amount = Number(tournament.entryFee);
            if (participant.tournamentDivisionId) {
                const division = await this.paymentsRepository.findDivisionById(participant.tournamentDivisionId);
                if (!division || division.tournamentId !== tournament.id) {
                    throw new common_1.BadRequestException('Hạng mục thi đấu không hợp lệ.');
                }
                amount = Number(division.entryFee);
            }
            if (!Number.isSafeInteger(amount) || amount <= 0) {
                throw new common_1.BadRequestException('Lệ phí đăng ký phải là số nguyên dương.');
            }
            const percentage = await this.registrationPlatformFeePercentage(tournament);
            const playerCount = Math.max(1, await this.paymentsRepository.countParticipantPlayers(participant.id));
            const fee = Math.min(amount, (0, platform_fee_helper_1.calcPlatformFee)(amount, percentage) * playerCount);
            return {
                amount,
                platformFeeAmount: fee,
                participantId: participant.id,
                divisionId: participant.tournamentDivisionId ?? undefined,
            };
        }
        if (data.participantId || data.divisionId) {
            throw new common_1.BadRequestException('Phí cấp giải không nhận participantId hoặc divisionId.');
        }
        if (tournament.createdBy !== userId) {
            throw new common_1.ForbiddenException('Chỉ chủ giải đấu được thanh toán khoản phí này.');
        }
        this.assertPublishConfiguration(tournament);
        if (data.purpose === create_payment_dto_1.PaymentPurpose.TOURNAMENT_PUBLISH_FEE) {
            const amount = await this.publishFee(tournament);
            if (amount <= 0) {
                throw new common_1.BadRequestException('Giải đấu này không phát sinh phí công bố.');
            }
            return { amount, platformFeeAmount: amount };
        }
        if (tournament.status !== 'REGISTRATION_CLOSED') {
            throw new common_1.BadRequestException('Phí nền tảng chỉ được thanh toán sau khi chốt đăng ký.');
        }
        const players = await this.paymentsRepository.countTournamentPlayers(tournament.id);
        const percentage = await this.registrationPlatformFeePercentage(tournament);
        const amount = players * (0, platform_fee_helper_1.calcPlatformFee)(Number(tournament.entryFee), percentage);
        if (amount <= 0)
            throw new common_1.BadRequestException('Không có phí nền tảng cần thanh toán.');
        return { amount, platformFeeAmount: amount };
    }
    async publishFee(tournament) {
        const key = tournament.tournamentType === 'PUBLIC'
            ? tournament.isRanked
                ? 'TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED'
                : 'TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED'
            : 'TOURNAMENT_PUBLISH_FEE_CLUB';
        const fallback = '0';
        const amount = Number(await this.paymentsRepository.getConfigValue(key, fallback));
        if (!Number.isSafeInteger(amount) || amount < 0) {
            throw new common_1.BadRequestException(`Cấu hình ${key} không hợp lệ.`);
        }
        return amount;
    }
    async registrationPlatformFeePercentage(tournament) {
        const key = tournament.tournamentType === 'PUBLIC'
            ? tournament.isRanked
                ? 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED'
                : 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED'
            : 'PLATFORM_FEE_PERCENTAGE_CLUB';
        const fallback = tournament.tournamentType === 'PUBLIC'
            ? tournament.platformFeePercentage
            : '0';
        const percentage = Number(await this.paymentsRepository.getConfigValue(key, fallback));
        if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
            throw new common_1.BadRequestException(`Cấu hình ${key} không hợp lệ.`);
        }
        return percentage;
    }
    assertPublishConfiguration(tournament) {
        if (!tournament.description?.trim()) {
            throw new common_1.BadRequestException('Giải đấu phải có mô tả trước khi thanh toán.');
        }
        if (!tournament.startDate ||
            !tournament.endDate ||
            !tournament.registrationStartDate ||
            !tournament.registrationEndDate ||
            !tournament.venueId) {
            throw new common_1.BadRequestException('Giải đấu chưa cấu hình đủ thời gian và địa điểm.');
        }
    }
    async afterPaymentCompleted(payment) {
        const tournament = await this.paymentsRepository.findTournamentById(payment.tournamentId);
        if (!tournament)
            return;
        try {
            if (payment.purpose === 'REGISTRATION_FEE' && payment.participantId) {
                await this.notificationsService.sendNotification((0, notification_builder_1.buildParticipantPaymentCompletedNotification)({
                    receiverId: payment.userId,
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                    divisionId: payment.divisionId,
                }));
                if (tournament.createdBy !== payment.userId) {
                    await this.notificationsService.sendNotification((0, notification_builder_1.buildOrganizerPaymentCompletedNotification)({
                        receiverId: tournament.createdBy,
                        tournamentId: tournament.id,
                        tournamentName: tournament.name,
                        divisionId: payment.divisionId,
                    }));
                }
            }
            else if (payment.purpose === 'TOURNAMENT_PUBLISH_FEE') {
                const nextStatus = 'PENDING_APPROVAL';
                await this.paymentsRepository.setTournamentStatus(tournament.id, nextStatus);
                await this.notificationsService.sendNotification((0, notification_builder_1.buildTournamentPublishApprovedNotification)({
                    receiverId: tournament.createdBy,
                    tournamentId: tournament.id,
                    tournamentName: tournament.name,
                }));
            }
            else if (payment.purpose === 'PLATFORM_FEE') {
                await this.paymentsRepository.setTournamentStatus(tournament.id, 'UPCOMING');
            }
        }
        catch (error) {
            console.error('Post-payment notification/status update failed:', error);
        }
    }
    sanitizeWebhookData(data) {
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
    async ensurePaymentStillCompletable(payment) {
        if (payment.purpose !== 'REGISTRATION_FEE' || !payment.participantId) {
            return null;
        }
        const participant = await this.paymentsRepository.findParticipantById(payment.participantId);
        if (!participant || participant.tournamentId !== payment.tournamentId) {
            return 'PARTICIPANT_NOT_FOUND';
        }
        if (participant.registeredBy !== payment.userId) {
            return 'PARTICIPANT_OWNER_MISMATCH';
        }
        if (participant.isPaid) {
            return 'PARTICIPANT_ALREADY_PAID';
        }
        if (payment.divisionId && payment.divisionId !== participant.tournamentDivisionId) {
            return 'PARTICIPANT_DIVISION_MISMATCH';
        }
        if (!['COMPLETE', 'PENDING_APPROVAL'].includes(participant.teamStatus)) {
            return `PARTICIPANT_STATUS_${participant.teamStatus}`;
        }
        return null;
    }
    secretsMatch(expected, supplied) {
        const expectedBuffer = Buffer.from(expected);
        const suppliedBuffer = Buffer.from(supplied);
        return expectedBuffer.length === suppliedBuffer.length && (0, crypto_1.timingSafeEqual)(expectedBuffer, suppliedBuffer);
    }
    errorMessage(error, fallback) {
        return error instanceof Error ? error.message : fallback;
    }
};
exports.PaymentsService = PaymentsService;
exports.PaymentsService = PaymentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [payments_repository_1.PaymentsRepository,
        notifications_service_1.NotificationsService,
        config_1.ConfigService,
        registration_lock_service_1.RegistrationLockService])
], PaymentsService);
//# sourceMappingURL=payments.service.js.map