import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateLiteTournamentDto {
  @ApiProperty({ example: 'Giải Cầu lông Cuối Tuần', description: 'Tên giải đấu' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'uuid-community', description: 'ID câu lạc bộ' })
  @IsUUID()
  @IsNotEmpty()
  communityId: string;

  @ApiProperty({ example: 'badminton', description: 'Môn thi đấu (slug)', enum: ['badminton', 'tennis', 'pickleball', 'table_tennis'] })
  @IsString()
  @IsIn(['badminton', 'tennis', 'pickleball', 'table_tennis'])
  sport: string;

  @ApiPropertyOptional({ example: 'singles', description: 'Hình thức: đánh đơn hoặc đôi', enum: ['singles', 'doubles'] })
  @IsString()
  @IsOptional()
  @IsIn(['singles', 'doubles'])
  format?: string;

  @ApiPropertyOptional({ example: 'single_elimination', description: 'Thể thức thi đấu', enum: ['single_elimination', 'double_elimination', 'round_robin', 'group_stage_knockout', 'group_stage_then_knockout'] })
  @IsString()
  @IsOptional()
  @IsIn(['single_elimination', 'double_elimination', 'round_robin', 'group_stage_knockout', 'group_stage_then_knockout'])
  bracketType?: string;

  @ApiPropertyOptional({ example: 16, description: 'Số đội tối đa (2-32)' })
  @IsNumber()
  @IsOptional()
  @Min(2)
  @Max(32)
  maxTeams?: number;

  @ApiPropertyOptional({ example: 'Giải đấu giao lưu cuối tuần', description: 'Mô tả giải đấu' })
  @IsString()
  @IsOptional()
  description?: string;
}
