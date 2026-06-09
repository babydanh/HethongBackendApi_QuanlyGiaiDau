import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, Min, IsString, IsNotEmpty } from 'class-validator';

export class PayoutRequestDto {
  @ApiProperty({
    example: 'uuid-tournament',
    description: 'ID của giải đấu cần rút tiền',
  })
  @IsUUID()
  tournamentId: string;

  @ApiProperty({
    example: 10000000,
    description: 'Số tiền muốn rút',
  })
  @IsNumber()
  @Min(10000)
  amountRequested: number;

  @ApiProperty({
    example: 'Vietcombank',
    description: 'Tên ngân hàng',
  })
  @IsString()
  @IsNotEmpty()
  bankName: string;

  @ApiProperty({
    example: '0123456789',
    description: 'Số tài khoản',
  })
  @IsString()
  @IsNotEmpty()
  bankAccountNumber: string;

  @ApiProperty({
    example: 'NGUYEN VAN A',
    description: 'Tên chủ tài khoản',
  })
  @IsString()
  @IsNotEmpty()
  bankAccountName: string;
}
