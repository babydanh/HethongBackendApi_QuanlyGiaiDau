import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFootballTeamDto {
  @ApiProperty({ example: 'FC Sao Vàng' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: 'Category bóng đá' })
  @IsUUID()
  categoryId!: string;

  @ApiPropertyOptional({ description: 'Logo đội' })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional({ description: 'CLB liên kết, nếu có' })
  @IsOptional()
  @IsUUID()
  communityId?: string;
}
