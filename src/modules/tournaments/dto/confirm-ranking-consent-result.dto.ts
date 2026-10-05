import { ApiProperty } from '@nestjs/swagger';

export class ConfirmRankingConsentResultDto {
  @ApiProperty({
    description: 'ID người tham gia mà xác nhận này áp dụng.',
    format: 'uuid',
  })
  participantId!: string;

  @ApiProperty({
    description:
      'Thời điểm xác nhận. Chỉ những trận HOÀN THÀNH từ thời điểm này trở đi mới ' +
      'được tính Elo và ghi lịch sử đấu. Các trận đã đấu trước đó không tính.',
    type: String,
    format: 'date-time',
  })
  consentedAt!: string;

  @ApiProperty({
    description:
      'true nghĩa là người này đã xác nhận từ trước và lần gọi này không làm thay đổi ' +
      'mốc thời gian. Mốc không bao giờ được ghi lại, nên bấm lại không thể đẩy ranh giới ' +
      'tính điểm ra xa hơn.',
    example: false,
  })
  alreadyConfirmed!: boolean;
}
