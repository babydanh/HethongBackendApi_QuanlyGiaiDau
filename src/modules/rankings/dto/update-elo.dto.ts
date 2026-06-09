import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateEloDto {
  @ApiProperty({
    example: 'uuid-user-1',
    description: 'User ID của người thắng',
  })
  @IsUUID()
  winnerId: string;

  @ApiProperty({
    example: 'uuid-user-2',
    description: 'User ID của người thua',
  })
  @IsUUID()
  loserId: string;

  @ApiProperty({ example: 'uuid-category', description: 'Category ID' })
  @IsUUID()
  categoryId: string;

  @ApiProperty({ example: 'uuid-match', description: 'Match ID' })
  @IsUUID()
  matchId: string;

  @ApiProperty({
    example: 1,
    description: 'Tỉ số thực tế (1: thắng, 0.5: hoà)',
  })
  @IsNumber()
  score: number;

  @ApiProperty({ example: 'SINGLES', description: 'Thể loại thi đấu (SINGLES/DOUBLES)' })
  @IsString()
  matchType: string;

  @ApiPropertyOptional({ example: 'uuid-community', description: 'Community ID (nếu có)' })
  @IsOptional()
  @IsUUID()
  communityId?: string;
}
