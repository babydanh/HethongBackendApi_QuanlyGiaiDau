import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { BracketGeneratorService } from '../tournaments/bracket-generator.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { WebhookDto } from './dto/webhook.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly bracketGeneratorService: BracketGeneratorService,
  ) {}

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
        payload.rawPayload,
        'WEBHOOK_CALLBACK',
      );
      
      if (!payment.participantId) {
        try {
          await this.bracketGeneratorService.generateSingleElimination(payment.tournamentId, payment.userId);
        } catch (err) {
          console.error('Failed to auto-generate bracket on platform fee payment:', err);
        }
      }
      
      return { message: 'Payment confirmed successfully' };
    } else {
      // Thanh toán thất bại
      await this.paymentsRepository.updatePaymentStatus(
        payment.id,
        'FAILED',
        payload.rawPayload,
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

  async findUserPayments(userId: string) {
    return this.paymentsRepository.findUserPayments(userId);
  }

  async findOrganizerPayouts(organizerId: string) {
    return this.paymentsRepository.findOrganizerPayouts(organizerId);
  }

  async findPaymentById(id: string) {
    const payment = await this.paymentsRepository.findPaymentById(id);
    if (!payment) {
      throw new NotFoundException('Payment transaction not found');
    }
    return payment;
  }

  async findAllPayouts() {
    return this.paymentsRepository.findAllPayoutRequests();
  }

  async reviewPayout(
    adminId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    proofUrl?: string,
    note?: string,
  ) {
    try {
      return await this.paymentsRepository.updatePayoutStatus(id, status, adminId, {
        transactionProofUrl: proofUrl,
        note,
      });
    } catch (error: any) {
      throw new BadRequestException(error.message || 'Failed to update payout status');
    }
  }

  async findAllTransactions() {
    return this.paymentsRepository.findAllPayments();
  }

  async getStats() {
    return this.paymentsRepository.getAdminStats();
  }
}

