import { IsNotEmpty, IsString, IsArray, IsUUID, IsOptional, IsIn } from 'class-validator';
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
  @IsString()
  guestEmail?: string;

  @ApiPropertyOptional({ description: 'Số điện thoại guest' })
  @IsOptional()
  @IsString()
  guestPhone?: string;
}