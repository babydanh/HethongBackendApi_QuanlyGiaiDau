import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCameraDeviceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  communityId!: string;

  @ApiProperty({ example: 'Camera sân 1' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: 'COURT-01' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  defaultCourtId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assignedOperatorId?: string | null;

  @ApiPropertyOptional({ example: 'Điện thoại Android ở bàn trọng tài' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}
