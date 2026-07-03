import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsString } from 'class-validator';

export interface PayOSWebhookData {
  orderCode: number;
  amount: number;
  description: string;
  accountNumber: string;
  reference: string;
  transactionDateTime: string;
  currency: string;
  paymentLinkId: string;
  code: string;
  desc: string;
  counterAccountBankId?: string | null;
  counterAccountBankName?: string | null;
  counterAccountName?: string | null;
  counterAccountNumber?: string | null;
  virtualAccountName?: string | null;
  virtualAccountNumber?: string | null;
}

export class WebhookDto {
  @ApiProperty({ example: '00' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'success' })
  @IsString()
  @IsNotEmpty()
  desc: string;

  @ApiProperty()
  @IsBoolean()
  success: boolean;

  @ApiProperty({ type: 'object', additionalProperties: true })
  @IsObject()
  data: PayOSWebhookData;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  signature: string;
}
