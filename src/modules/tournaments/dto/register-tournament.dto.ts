import { IsNotEmpty, IsString, IsArray, IsUUID, IsOptional, IsIn, IsEmail, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterTournamentDto {
  @ApiProperty({ description: 'Tên đội tham gia' })
  @IsString()
  @IsNotEmpty()
  teamName: string;

  @ApiPropertyOptional({ description: 'Danh sách ID các thành viên trong đội', type: [String] })
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @ApiPropertyOptional({ description: 'Email hoặc SĐT của đồng đội (cho đánh đôi)' })
  @IsString()
  @IsOptional()
  @Matches(/^(?:[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|(?:\+84|0[3|5|7|8|9])\d{8})$/, {
    message: 'Đồng đội phải là Email hoặc Số điện thoại Việt Nam hợp lệ',
  })
  partnerEmailOrPhone?: string;

  @ApiPropertyOptional({ description: 'ID hình thức thi đấu muốn đăng ký' })
  @IsUUID('4')
  @IsOptional()
  divisionId?: string;

  @ApiPropertyOptional({ description: 'ID hình thức thi đấu muốn đăng ký' })
  @IsUUID('4')
  @IsOptional()
  tournamentDivisionId?: string;

  @ApiPropertyOptional({ description: 'Loại đăng ký guest', enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'] })
  @IsOptional()
  @IsString()
  @IsIn(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])
  matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';

  @ApiPropertyOptional({ description: 'Tên người đăng ký guest' })
  @IsOptional()
  @IsString()
  guestName?: string;

  @ApiPropertyOptional({ description: 'Email guest' })
  @IsOptional()
  @IsEmail({}, { message: 'Email khách không hợp lệ' })
  guestEmail?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại guest' })
  @IsOptional()
  @IsString()
  @Matches(/^(?:\+84|0[3|5|7|8|9])\d{8}$/, {
    message: 'Số điện thoại khách không hợp lệ. Phải là số điện thoại Việt Nam (ví dụ: 0912345678 hoặc +84912345678)',
  })
  guestPhone?: string;
}