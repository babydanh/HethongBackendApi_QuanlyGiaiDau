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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const payments_service_1 = require("./payments.service");
const create_payment_dto_1 = require("./dto/create-payment.dto");
const payout_request_dto_1 = require("./dto/payout-request.dto");
const webhook_dto_1 = require("./dto/webhook.dto");
const review_payout_dto_1 = require("./dto/review-payout.dto");
const confirm_refund_dto_1 = require("./dto/confirm-refund.dto");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const skip_app_key_decorator_1 = require("../../common/decorators/skip-app-key.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const enums_1 = require("../../common/constants/enums");
let PaymentsController = class PaymentsController {
    paymentsService;
    constructor(paymentsService) {
        this.paymentsService = paymentsService;
    }
    async getAdminStats() {
        return this.paymentsService.getStats();
    }
    async findAllPayouts() {
        return this.paymentsService.findAllPayouts();
    }
    async reviewPayout(id, reviewPayoutDto, user) {
        return this.paymentsService.reviewPayout(user.sub, id, reviewPayoutDto.status, reviewPayoutDto.transactionProofUrl, reviewPayoutDto.note);
    }
    async findAllTransactions() {
        return this.paymentsService.findAllTransactions();
    }
    async findAdminPaymentReceipt(id) {
        return this.paymentsService.findAdminPaymentReceipt(id);
    }
    async confirmRefund(id, body, user) {
        return this.paymentsService.confirmRefund(user.sub, id, body.transactionProofUrl);
    }
    async createPaymentLink(createPaymentDto, user) {
        return this.paymentsService.createPaymentLink(user.sub, createPaymentDto);
    }
    async handleWebhook(webhookDto) {
        return this.paymentsService.handleWebhook(webhookDto);
    }
    async mockVerify(body) {
        return this.paymentsService.mockVerify(body.paymentId);
    }
    async requestPayout(payoutRequestDto, user) {
        return this.paymentsService.requestPayout(user.sub, payoutRequestDto);
    }
    async findMyPayments(user) {
        return this.paymentsService.findUserPayments(user.sub);
    }
    async findMyPayouts(user) {
        return this.paymentsService.findOrganizerPayouts(user.sub);
    }
    async findPaymentById(id, user) {
        return this.paymentsService.findPaymentById(user.sub, id);
    }
    async findPaymentReceipt(id, user) {
        return this.paymentsService.findPaymentReceipt(user.sub, id);
    }
};
exports.PaymentsController = PaymentsController;
__decorate([
    (0, common_1.Get)('admin/stats'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy dữ liệu thống kê Dashboard Admin (Chỉ ADMIN)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "getAdminStats", null);
__decorate([
    (0, common_1.Get)('admin/payouts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy tất cả danh sách yêu cầu rút tiền (Chỉ ADMIN)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findAllPayouts", null);
__decorate([
    (0, common_1.Patch)('admin/payouts/:id/review'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Phê duyệt hoặc từ chối yêu cầu rút tiền (Chỉ ADMIN)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, review_payout_dto_1.ReviewPayoutDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "reviewPayout", null);
__decorate([
    (0, common_1.Get)('admin/transactions'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy tất cả các giao dịch thanh toán trên sàn (Chỉ ADMIN)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findAllTransactions", null);
__decorate([
    (0, common_1.Get)('admin/payments/:id/receipt'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Xem chứng từ thanh toán đã phát hành (Chỉ ADMIN)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findAdminPaymentReceipt", null);
__decorate([
    (0, common_1.Post)('admin/payments/:id/confirm-refund'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ADMIN),
    (0, swagger_1.ApiOperation)({ summary: 'Xác nhận đã hoàn tiền thủ công cho giao dịch rút giải (Chỉ ADMIN)' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, confirm_refund_dto_1.ConfirmRefundDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "confirmRefund", null);
__decorate([
    (0, common_1.Post)('create-link'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.PLAYER, enums_1.UserRole.ORGANIZER),
    (0, throttler_1.Throttle)({ sensitive: { limit: 5, ttl: 60000 } }),
    (0, swagger_1.ApiOperation)({ summary: 'Tạo link thanh toán (VNPAY/MoMo)' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_payment_dto_1.CreatePaymentDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "createPaymentLink", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, skip_app_key_decorator_1.SkipAppKey)(),
    (0, common_1.Post)('webhook'),
    (0, swagger_1.ApiOperation)({ summary: 'Webhook nhận callback từ Cổng thanh toán' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [webhook_dto_1.WebhookDto]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "handleWebhook", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, skip_app_key_decorator_1.SkipAppKey)(),
    (0, common_1.Post)('mock-verify'),
    (0, swagger_1.ApiOperation)({ summary: 'Mock verify payment (for demo)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "mockVerify", null);
__decorate([
    (0, common_1.Post)('payout'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER),
    (0, swagger_1.ApiOperation)({ summary: 'Yêu cầu rút tiền (Payout) cho Ban tổ chức' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [payout_request_dto_1.PayoutRequestDto, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "requestPayout", null);
__decorate([
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.PLAYER, enums_1.UserRole.ORGANIZER),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách lịch sử thanh toán cá nhân' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findMyPayments", null);
__decorate([
    (0, common_1.Get)('payouts'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.ORGANIZER),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy danh sách yêu cầu rút tiền của Ban tổ chức' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findMyPayouts", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.PLAYER, enums_1.UserRole.ORGANIZER),
    (0, swagger_1.ApiOperation)({ summary: 'Lấy chi tiết giao dịch thanh toán theo ID' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findPaymentById", null);
__decorate([
    (0, common_1.Get)(':id/receipt'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, roles_decorator_1.Roles)(enums_1.UserRole.PLAYER, enums_1.UserRole.ORGANIZER),
    (0, swagger_1.ApiOperation)({ summary: 'Xem chứng từ giao dịch đã hoàn tất' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], PaymentsController.prototype, "findPaymentReceipt", null);
exports.PaymentsController = PaymentsController = __decorate([
    (0, swagger_1.ApiTags)('payments'),
    (0, common_1.Controller)('payments'),
    __metadata("design:paramtypes", [payments_service_1.PaymentsService])
], PaymentsController);
//# sourceMappingURL=payments.controller.js.map