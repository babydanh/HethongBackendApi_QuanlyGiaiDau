import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum PaymentPurpose {
  REGISTRATION_FEE = 'REGISTRATION_FEE',
  TOURNAMENT_PUBLISH_FEE = 'TOURNAMENT_PUBLISH_FEE',
  PLATFORM_FEE = 'PLATFORM_FEE',
}

export class CreatePaymentDto {
  @ApiProperty({ enum: PaymentPurpose, description: 'Mục đích thanh toán' })
  @IsEnum(PaymentPurpose)
  purpose: PaymentPurpose;

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

  @ApiPropertyOptional({
    example: 'uuid-division',
    description: 'ID hình thức thi đấu liên quan đến thanh toán',
  })
  @IsUUID()
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({
    example: 100000,
    description: 'Số tiền thanh toán',
  })
  @IsOptional()
  amount?: number;

}
