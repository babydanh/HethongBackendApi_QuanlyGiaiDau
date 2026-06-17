import { IsNotEmpty, IsString, IsArray, IsUUID, IsOptional } from 'class-validator';
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
}
