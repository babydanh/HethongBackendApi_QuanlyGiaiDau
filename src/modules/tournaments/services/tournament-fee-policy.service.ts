import { BadRequestException, Injectable } from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';

@Injectable()
export class TournamentFeePolicyService {
  constructor(private readonly tournamentsRepository: TournamentsRepository) {}
  async assertEntryFeeAllowed(entryFee: number | null | undefined) {
    if (entryFee === null || entryFee === undefined || entryFee === 0) {
      return;
    }

    // PUBLIC tournaments may use any valid non-negative VND integer. The
    // 100,000 VND value belongs to platform-fee calculation, not this guard.
    if (!Number.isSafeInteger(entryFee) || entryFee < 0) {
      throw new BadRequestException(
        'Lệ phí tham gia phải là số nguyên VND không âm.',
      );
    }

    const feesConfig = await this.tournamentsRepository.getFeesConfig();
    if (feesConfig.allowEntryFees === false) {
      throw new BadRequestException(
        'Hệ thống hiện không cho phép ban tổ chức đặt lệ phí đăng ký. Vui lòng để lệ phí là 0đ.',
      );
    }
  }

  resolveDivisionEntryFeeMutation(dto: {
    entryFee?: number | null;
    entryFeeOverrideEnabled?: boolean;
  }) {
    const hasMutation =
      dto.entryFeeOverrideEnabled !== undefined || dto.entryFee !== undefined;
    if (!hasMutation) {
      return { hasMutation: false, enabled: false, fee: null } as const;
    }

    const enabled =
      dto.entryFeeOverrideEnabled ??
      (dto.entryFee !== undefined && dto.entryFee !== null && dto.entryFee > 0);
    const fee = enabled ? dto.entryFee : null;
    if (enabled && fee == null) {
      throw new BadRequestException(
        'Vui lòng nhập lệ phí riêng hoặc tắt tùy chọn lệ phí riêng.',
      );
    }

    return { hasMutation: true, enabled, fee } as const;
  }
  async getFeesConfig() {
    return this.tournamentsRepository.getFeesConfig();
  }

  async getPublishFee(
    tournamentType?: string | null,
    isRanked?: boolean | null,
  ) {
    const fees = await this.getFeesConfig();
    if (tournamentType === 'CLUB') return fees.feeClub;
    return isRanked ? fees.feePublicRanked : fees.feePublicUnranked;
  }
}
