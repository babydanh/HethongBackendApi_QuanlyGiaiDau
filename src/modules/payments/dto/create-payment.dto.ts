import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsOptional, Min, IsString } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({
    example: 'uuid-tournament',
    description: 'ID của giải đấu cần thanh toán phí tham gia',
  })
  @IsUUID()
  tournamentId: string;

  @ApiPropertyOptional({
    example: 'uuid-participant',
    description: 'ID của lượt đăng ký tham gia giải đấu (nếu có)',
  })
  @IsUUID()
  @IsOptional()
  participantId?: string;

  @ApiProperty({
    example: 500000,
    description: 'Số tiền cần thanh toán',
  })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiPropertyOptional({
    example: 'VNPAY',
    description: 'Cổng thanh toán (mặc định VNPAY)',
  })
  @IsString()
  @IsOptional()
  paymentGateway?: string;
}
