import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateParentTournamentDto {
  @ApiProperty({
    example: 'Giải Tây Nguyên Open 2026',
    description: 'Tên chuỗi giải đấu / giải đấu lớn',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    example: 'Giải đấu quy mô lớn bao gồm nhiều thể loại đấu khác nhau.',
    description: 'Mô tả chi tiết',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Banner đại diện' })
  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @ApiPropertyOptional({ example: 'https://...', description: 'Logo đại diện' })
  @IsString()
  @IsOptional()
  logoUrl?: string;
}
