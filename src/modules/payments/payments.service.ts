import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PaymentsRepository } from './payments.repository';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PayoutRequestDto } from './dto/payout-request.dto';
import { WebhookDto } from './dto/webhook.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly paymentsRepository: PaymentsRepository,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPaymentLink(userId: string, data: CreatePaymentDto) {
    if (!data.participantId) {
      const tournament = await this.paymentsRepository.findTournamentById(data.tournamentId);
      if (!tournament) {
        throw new NotFoundException('Không tìm thấy giải đấu');
      }

      if (!tournament.description || tournament.description.trim() === '') {
        throw new BadRequestException('Vui lòng nhập mô tả chi tiết của giải đấu trước khi thanh toán công bố.');
      }

      if (!tournament.bannerUrl || tournament.bannerUrl.trim() === '') {
        throw new BadRequestException('Vui lòng tải lên ảnh bìa (banner) giải đấu trước khi thanh toán công bố.');
      }

      if (!tournament.startDate) {
        throw new BadRequestException('Vui lòng cấu hình ngày bắt đầu giải đấu trước khi thanh toán công bố.');
      }

      if (!tournament.endDate) {
        throw new BadRequestException('Vui lòng cấu hình ngày kết thúc giải đấu trước khi thanh toán công bố.');
      }

      if (!tournament.registrationStartDate) {
        throw new BadRequestException('Vui lòng cấu hình ngày bắt đầu đăng ký trước khi thanh toán công bố.');
      }

      if (!tournament.registrationEndDate) {
        throw new BadRequestException('Vui lòng cấu hình ngày kết thúc đăng ký trước khi thanh toán công bố.');
      }

      if (!tournament.venueId) {
        throw new BadRequestException('Vui lòng cấu hình địa điểm thi đấu (sân đấu) trước khi thanh toán công bố.');
      }
    }

    const payment = await this.paymentsRepository.createPayment(userId, data);
    const mockUrl = `/payments/result?paymentId=${payment.id}&vnp_ResponseCode=00`;
    
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
      
      // Bắn thông báo đăng ký thành công cho VĐV
      const tournament = await this.paymentsRepository.findTournamentById(payment.tournamentId);
      if (payment.participantId && tournament) {
        try {
          await this.notificationsService.sendNotification({
            receiverId: payment.userId,
            type: 'TOURNAMENT_REGISTER_SUCCESS',
            title: 'Đăng ký giải đấu thành công',
            content: `Bạn đã đăng ký thành công giải đấu ${tournament.name}.`,
            redirectUrl: `/tournaments/${tournament.id}`,
          });
        } catch (err) {
          console.error('Failed to send notification for payment completion:', err);
        }
      }
      
      if (!payment.participantId) {
        // Find the tournament to check its type and ranked flag
        const tournament = await this.paymentsRepository.findTournamentById(payment.tournamentId);
        
        if (tournament && tournament.status === 'REGISTRATION_CLOSED') {
          // This is the platform fee payment for a closed/locked tournament
          try {
            await this.paymentsRepository.setTournamentStatus(payment.tournamentId, 'UPCOMING');
          } catch (err) {
            console.error('Failed to set tournament status to UPCOMING on platform fee payment:', err);
          }
        } else {
          // Get expected fees from system configs
          let expectedFee = 0;
          if (tournament) {
            if (tournament.tournamentType === 'PUBLIC') {
              const configKey = tournament.isRanked 
                ? 'TOURNAMENT_PUBLISH_FEE_PUBLIC_RANKED' 
                : 'TOURNAMENT_PUBLISH_FEE_PUBLIC_UNRANKED';
              expectedFee = parseFloat(await this.paymentsRepository.getConfigValue(configKey, tournament.isRanked ? '100000' : '50000'));
            } else {
              const configKey = 'TOURNAMENT_PUBLISH_FEE_CLUB';
              expectedFee = parseFloat(await this.paymentsRepository.getConfigValue(configKey, '0'));
            }
          }

          // If the payment matches the publishing fee, publish it
          if (parseFloat(payment.amount) === expectedFee) {
            try {
              const nextStatus = tournament?.isRanked ? 'PENDING_APPROVAL' : 'REGISTRATION_OPEN';
              await this.paymentsRepository.setTournamentStatus(payment.tournamentId, nextStatus);
            } catch (err) {
              console.error(`Failed to set tournament status to ${tournament?.isRanked ? 'PENDING_APPROVAL' : 'REGISTRATION_OPEN'} on publish fee payment:`, err);
            }
          }
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
    // 1. Get the tournament
    const tournament = await this.paymentsRepository.findTournamentById(data.tournamentId);
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    // 2. Fetch platform fee percentage from config
    let configKey = 'PLATFORM_FEE_PERCENTAGE_CLUB';
    let defaultPct = '0';
    if (tournament.tournamentType === 'PUBLIC') {
      configKey = tournament.isRanked 
        ? 'PLATFORM_FEE_PERCENTAGE_PUBLIC_RANKED' 
        : 'PLATFORM_FEE_PERCENTAGE_PUBLIC_UNRANKED';
      defaultPct = '5';
    }

    const platformFeePercentage = parseFloat(
      await this.paymentsRepository.getConfigValue(configKey, defaultPct)
    );

    // 3. Query total collected registration fees from database
    const totalCollected = await this.paymentsRepository.getTotalCollected(data.tournamentId);
    if (totalCollected === 0) {
      throw new BadRequestException('No registration fees collected yet. Payout cannot be requested.');
    }
    
    const maxWithdrawable = totalCollected * (1 - platformFeePercentage / 100);
    if (data.amountRequested > maxWithdrawable) {
      throw new BadRequestException('Requested amount exceeds available balance');
    }

    const platformFeeRetained = totalCollected * (platformFeePercentage / 100);

    // 4. Determine holdUntil date based on user roles
    const userRoles = await this.paymentsRepository.getUserRoles(organizerId);
    const isOrganizerOrAdmin = userRoles.includes('organizer') || userRoles.includes('admin');
    const holdUntil = isOrganizerOrAdmin ? null : (tournament.endDate ? new Date(tournament.endDate) : null);

    return this.paymentsRepository.createPayoutRequest(
      organizerId,
      data,
      totalCollected,
      platformFeeRetained,
      holdUntil,
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update payout status';
      throw new BadRequestException(message);
    }
  }

  async findAllTransactions() {
    return this.paymentsRepository.findAllPayments();
  }

  async getStats() {
    return this.paymentsRepository.getAdminStats();
  }
}
