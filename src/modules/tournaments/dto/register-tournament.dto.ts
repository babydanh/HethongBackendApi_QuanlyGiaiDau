import { IsNotEmpty, IsString, IsArray, IsUUID, IsOptional, IsIn, Matches, IsBoolean, IsObject } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Danh sách ID cầu thủ dự bị của đội bóng', type: [String] })
  @IsArray()
  @IsOptional()
  @IsUUID('4', { each: true })
  reserveMemberIds?: string[];

  @ApiPropertyOptional({ description: 'Đội bóng đã tạo trước đó dùng cho nội dung bóng đá' })
  @IsUUID('4')
  @IsOptional()
  footballTeamId?: string;

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

  @ApiPropertyOptional({ description: 'Loại đăng ký', enum: ['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'] })
  @IsOptional()
  @IsString()
  @IsIn(['SINGLES', 'DOUBLES', 'MIXED_DOUBLES'])
  matchType?: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';

  @ApiPropertyOptional({
    description: 'Nguoi dang ky dong y gui ket qua va diem ELO len bang xep hang',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  rankingConsent?: boolean;

  @ApiPropertyOptional({ description: 'Câu trả lời cho form đăng ký tùy chỉnh', type: Object })
  @IsObject()
  @IsOptional()
  customResponses?: Record<string, unknown>;
}
