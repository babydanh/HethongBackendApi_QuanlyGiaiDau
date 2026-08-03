import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ParticipantImportItemDto {
  @ApiProperty({ description: 'Tên đội / cặp đấu hoặc tên VĐV' })
  @IsString()
  teamName: string;

  @ApiProperty({ description: 'Họ tên VĐV 1' })
  @IsString()
  player1Name: string;

  @ApiPropertyOptional({ description: 'Email VĐV 1' })
  @IsOptional()
  @IsString()
  player1Email?: string;

  @ApiPropertyOptional({ description: 'SĐT VĐV 1' })
  @IsOptional()
  @IsString()
  player1Phone?: string;

  @ApiPropertyOptional({ description: 'Họ tên VĐV 2 (nếu giải đôi)' })
  @IsOptional()
  @IsString()
  player2Name?: string;

  @ApiPropertyOptional({ description: 'Email VĐV 2' })
  @IsOptional()
  @IsString()
  player2Email?: string;

  @ApiPropertyOptional({ description: 'SĐT VĐV 2' })
  @IsOptional()
  @IsString()
  player2Phone?: string;

  @ApiPropertyOptional({ description: 'Điểm trình / ELO khởi tạo' })
  @IsOptional()
  @IsNumber()
  elo?: number;

  @ApiPropertyOptional({ description: 'Đã thanh toán lệ phí hay chưa' })
  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @ApiPropertyOptional({ description: 'Tự động duyệt hồ sơ (APPROVED)' })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @ApiPropertyOptional({ description: 'Ghi chú / câu trả lời custom form' })
  @IsOptional()
  customResponses?: Record<string, any>;
}

export class ImportParticipantsDto {
  @ApiPropertyOptional({ description: 'ID của division / nội dung thi đấu' })
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiProperty({ description: 'Danh sách VĐV / Đội cần nhập', type: [ParticipantImportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParticipantImportItemDto)
  participants: ParticipantImportItemDto[];

  @ApiPropertyOptional({ description: 'Tự động gửi email thư mời kích hoạt tài khoản' })
  @IsOptional()
  @IsBoolean()
  sendInvitationEmail?: boolean;

  @ApiPropertyOptional({ description: 'Gửi thông báo trong SportO cho các VĐV đã có tài khoản' })
  @IsOptional()
  @IsBoolean()
  notifyLinkedAccounts?: boolean;
}
