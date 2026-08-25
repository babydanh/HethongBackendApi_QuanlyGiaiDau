import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { WebhookDto } from './dto/webhook.dto';
import { ReviewPayoutDto } from './dto/review-payout.dto';
import { ConfirmRefundDto } from './dto/confirm-refund.dto';
import { MockVerifyPaymentDto } from './dto/mock-verify-payment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';

import { Public } from '../../common/decorators/public.decorator';
import { SkipAppKey } from '../../common/decorators/skip-app-key.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('admin/stats')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy dữ liệu thống kê Dashboard Admin (Chỉ ADMIN)' })
  async getAdminStats() {
    return this.paymentsService.getStats();
  }

  @Get('admin/payouts')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy tất cả danh sách yêu cầu rút tiền (Chỉ ADMIN)' })
  async findAllPayouts() {
    return this.paymentsService.findAllPayouts();
  }

  @Patch('admin/payouts/:id/review')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Phê duyệt hoặc từ chối yêu cầu rút tiền (Chỉ ADMIN)' })
  async reviewPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reviewPayoutDto: ReviewPayoutDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.reviewPayout(
      user.sub,
      id,
      reviewPayoutDto.status,
      reviewPayoutDto.transactionProofUrl,
      reviewPayoutDto.note,
    );
  }

  @Get('admin/transactions')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Lấy tất cả các giao dịch thanh toán trên sàn (Chỉ ADMIN)' })
  async findAllTransactions() {
    return this.paymentsService.findAllTransactions();
  }

  @Get('admin/payments/:id/receipt')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xem chứng từ thanh toán đã phát hành (Chỉ ADMIN)' })
  async findAdminPaymentReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.paymentsService.findAdminPaymentReceipt(id);
  }

  @Post('admin/payments/:id/confirm-refund')
  @ApiBearerAuth()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Xác nhận đã hoàn tiền thủ công cho giao dịch rút giải (Chỉ ADMIN)' })
  async confirmRefund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ConfirmRefundDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.confirmRefund(user.sub, id, body.transactionProofUrl);
  }

  @Post('create-link')
  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @Throttle({ sensitive: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Tạo link thanh toán (VNPAY/MoMo)' })
  async createPaymentLink(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.createPaymentLink(user.sub, createPaymentDto);
  }

  @Public()
  @SkipAppKey()
  @Post('webhook')
  @ApiOperation({ summary: 'Webhook nhận callback từ Cổng thanh toán' })
  async handleWebhook(@Body() webhookDto: WebhookDto) {
    return this.paymentsService.handleWebhook(webhookDto);
  }

  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @Post('mock-verify')
  @ApiOperation({ summary: 'Mock verify payment for controlled sandbox testing' })
  async mockVerify(
    @Body() body: MockVerifyPaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.mockVerify(user.sub, body.paymentId);
  }

  @Post('payout')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Yêu cầu rút tiền (Payout) cho Ban tổ chức' })
  async requestPayout(
    @Body() payoutRequestDto: PayoutRequestDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.requestPayout(user.sub, payoutRequestDto);
  }

  @Get('me')
  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Lấy danh sách lịch sử thanh toán cá nhân' })
  async findMyPayments(@CurrentUser() user: JwtPayload) {
    return this.paymentsService.findUserPayments(user.sub);
  }

  @Get('payouts')
  @ApiBearerAuth()
  @Roles(UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Lấy danh sách yêu cầu rút tiền của Ban tổ chức' })
  async findMyPayouts(@CurrentUser() user: JwtPayload) {
    return this.paymentsService.findOrganizerPayouts(user.sub);
  }

  @Get(':id')
  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Lấy chi tiết giao dịch thanh toán theo ID' })
  async findPaymentById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.findPaymentById(user.sub, id);
  }

  @Get(':id/receipt')
  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Xem chứng từ giao dịch đã hoàn tất' })
  async findPaymentReceipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.findPaymentReceipt(user.sub, id);
  }
}
