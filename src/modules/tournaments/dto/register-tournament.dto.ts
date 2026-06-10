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
}
