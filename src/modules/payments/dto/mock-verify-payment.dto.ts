import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class MockVerifyPaymentDto {
  @ApiProperty({ format: 'uuid', description: 'ID giao dịch cần xác minh thử nghiệm' })
  @IsUUID()
  paymentId: string;

}
