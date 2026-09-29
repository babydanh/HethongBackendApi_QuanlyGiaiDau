import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class SetCourtPlaybackUrlDto {
  @ApiPropertyOptional({
    example: 'https://media.aqvision.net/live/san1.live.flv',
    description:
      'URL phát trực tiếp của sân. Bỏ trống (hoặc gửi rỗng) để xoá URL và ngừng phát sân này.',
  })
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @MaxLength(2000)
  playbackUrl?: string;

  @ApiPropertyOptional({
    example: 'Camera sân 1',
    description: 'Tên hiển thị. Mặc định khi có URL là tên sân.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;
}
