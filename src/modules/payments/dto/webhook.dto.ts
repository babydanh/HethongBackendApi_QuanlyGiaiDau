import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class WebhookDto {
  @ApiProperty({
    example: 'uuid-payment',
    description: 'ID của hóa đơn trong hệ thống (Thường lưu ở vnp_TxnRef)',
  })
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @ApiProperty({
    example: '00',
    description: 'Mã phản hồi từ Gateway (VD: 00 là thành công)',
  })
  @IsString()
  @IsNotEmpty()
  responseCode: string;

  @ApiProperty({
    example: 'VNP123456789',
    description: 'Mã giao dịch tại Gateway',
  })
  @IsString()
  @IsOptional()
  gatewayTransactionId?: string;
  
  // Các field phụ khác mà Gateway có thể gửi về
  @IsOptional()
  rawPayload?: Record<string, unknown>;
}
