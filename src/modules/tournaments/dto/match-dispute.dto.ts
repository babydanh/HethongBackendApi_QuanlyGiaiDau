import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMatchDisputeDto {
  @ApiProperty()
  @IsUUID()
  matchId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(5)
  reason!: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}

export class ResolveMatchDisputeDto {
  @ApiProperty()
  @IsString()
  @MinLength(5)
  resolutionNote!: string;

  @ApiPropertyOptional({ enum: ['SCHEDULED', 'ONGOING', 'COMPLETED', 'DISPUTED'] })
  @IsOptional()
  @IsIn(['SCHEDULED', 'ONGOING', 'COMPLETED', 'DISPUTED'])
  matchStatus?: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'DISPUTED';
}
