import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { RosterImportItemDto } from './roster-import.dto';

export class RosterImportPreviewDto {
  @ApiPropertyOptional({ description: 'ID của division / nội dung thi đấu' })
  @IsOptional()
  @IsString()
  divisionId?: string;

  @ApiProperty({
    description: 'Danh sách VĐV / Đội cần xem trước',
    type: [RosterImportItemDto],
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RosterImportItemDto)
  participants: RosterImportItemDto[];
}
