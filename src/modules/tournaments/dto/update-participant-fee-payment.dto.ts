import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateParticipantFeePaymentDto {
  @ApiProperty({
    description:
      'true: Ban tổ chức xác nhận đã thu lệ phí ngoài hệ thống (tiền mặt/chuyển khoản). ' +
      'false: Gỡ cờ đã thanh toán; nếu có giao dịch đã thu thì hệ thống gửi yêu cầu hoàn tiền chờ Ban tổ chức duyệt.',
    example: true,
  })
  @IsBoolean()
  paid!: boolean;
}