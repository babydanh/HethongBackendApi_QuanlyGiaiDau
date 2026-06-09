import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { WebhookDto } from './dto/webhook.dto';

@Injectable()
export class PaymentsService {
  constructor(private readonly paymentsRepository: PaymentsRepository) {}

  async createPaymentLink(userId: string, data: CreatePaymentDto) {
    const payment = await this.paymentsRepository.createPayment(userId, data);
    
    // Todo: Tích hợp SDK VNPay/MoMo tại đây để generate URL thực tế.
    // Tạm thời mock URL cho MVP:
    const mockUrl = `https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_TxnRef=${payment.id}&vnp_Amount=${data.amount * 100}`;
    
    return {
      paymentId: payment.id,
      paymentUrl: mockUrl,
      status: payment.status,
    };
  }

  async handleWebhook(payload: WebhookDto) {
    const payment = await this.paymentsRepository.findPaymentById(
      payload.transactionReference,
    );

    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }

    if (payment.status === 'COMPLETED') {
      return { message: 'Payment already completed' };
    }

    if (payload.responseCode === '00') {
      // Thanh toán thành công
      await this.paymentsRepository.updatePaymentStatus(
        payment.id,
        'COMPLETED',
        payload.rawPayload as Record<string, unknown>,
        'WEBHOOK_CALLBACK',
      );
      
      // Todo: Gọi ParticipantRepository để update is_paid = true
      
      return { message: 'Payment confirmed successfully' };
    } else {
      // Thanh toán thất bại
      await this.paymentsRepository.updatePaymentStatus(
        payment.id,
        'FAILED',
        payload.rawPayload as Record<string, unknown>,
        'WEBHOOK_CALLBACK',
      );
      return { message: 'Payment marked as failed' };
    }
  }

  async requestPayout(organizerId: string, data: PayoutRequestDto) {
    // Todo: Truy vấn tổng tiền giải đấu đã thu được thực tế
    // Tạm thời mock 20,000,000
    const totalCollected = 20000000;
    const platformFeePercentage = 5; // 5%
    
    const maxWithdrawable = totalCollected * (1 - platformFeePercentage / 100);
    if (data.amountRequested > maxWithdrawable) {
      throw new BadRequestException('Requested amount exceeds available balance');
    }

    const platformFeeRetained = totalCollected * (platformFeePercentage / 100);

    return this.paymentsRepository.createPayoutRequest(
      organizerId,
      data,
      totalCollected,
      platformFeeRetained,
    );
  }
}
