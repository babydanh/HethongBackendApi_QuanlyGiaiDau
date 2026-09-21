import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsUUID,
} from 'class-validator';
import { CreateVenueDto } from '../../venues/dto/create-venue.dto';

/**
 * Runtime DTO for the tournament-detail venue dialog.
 *
 * The controller uses a global ValidationPipe with forbidNonWhitelisted=true,
 * so the optional fields used to initialize courts and choose the default
 * venue must be decorated on the actual runtime class rather than expressed
 * only as a TypeScript intersection.
 */
export class CreateTournamentVenueDto extends CreateVenueDto {
  @ApiPropertyOptional({
    description: 'Gắn một địa điểm đã lưu vào giải thay vì tạo bản ghi mới',
  })
  @IsOptional()
  @IsUUID()
  venueId?: string;

  @ApiPropertyOptional({
    description: 'Đặt địa điểm này làm địa điểm mặc định của giải',
  })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 4, minimum: 0, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(50)
  initialCourtCount?: number;

  @ApiPropertyOptional({ example: 'Sân' })
  @IsOptional()
  @IsString()
  courtPrefix?: string;
}
