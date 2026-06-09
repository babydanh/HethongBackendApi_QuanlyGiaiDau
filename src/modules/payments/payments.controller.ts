import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { WebhookDto } from './dto/webhook.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../../common/constants/enums';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-link')
  @ApiBearerAuth()
  @Roles(UserRole.PLAYER, UserRole.ORGANIZER)
  @ApiOperation({ summary: 'Tạo link thanh toán (VNPAY/MoMo)' })
  async createPaymentLink(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.paymentsService.createPaymentLink(user.sub, createPaymentDto);
  }

  @Public()
  @Post('webhook')
  @ApiOperation({ summary: 'Webhook nhận callback từ Cổng thanh toán' })
  async handleWebhook(@Body() webhookDto: WebhookDto) {
    return this.paymentsService.handleWebhook(webhookDto);
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
}
