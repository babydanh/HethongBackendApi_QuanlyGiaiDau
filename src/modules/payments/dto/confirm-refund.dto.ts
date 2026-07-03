import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class ConfirmRefundDto {
  @ApiProperty({ description: 'Link bằng chứng đã chuyển khoản hoàn tiền' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_tld: false })
  transactionProofUrl: string;
}
