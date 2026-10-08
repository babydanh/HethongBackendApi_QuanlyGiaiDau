import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Tham số dựng QR publish cho AQP Media Server.
 *
 * `publishKey` là INPUT của request, KHÔNG đọc từ env dùng chung: key AQP là
 * per-stream (panel AQP hiển thị dạng `<stream>?<key>`), nên một biến môi
 * trường toàn cục sẽ cho phép mọi ảnh chụp màn hình đẩy luồng giả cho toàn bộ
 * hệ thống. Operator dán key từ panel AQP cho đúng camera đang mở.
 */
export class PublishQrDto {
  @ApiProperty({
    example: 'pk_b3f7da9c66b1044eb2ce57c7f40a7761',
    description:
      'Publish key do AQP cấp cho ĐÚNG stream này (panel AQP có nút Copy). Không lưu vào DB, không ghi log.',
  })
  @IsString()
  @MinLength(4)
  @MaxLength(255)
  publishKey!: string;

  @ApiPropertyOptional({
    example: 'cameraip',
    description:
      'Stream ID đẩy lên AQP. Bỏ trống ⇒ dùng `streamName` của camera SportO.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  streamId?: string;

  @ApiPropertyOptional({
    example: 'Bán kết 1 - Sân Tân Bình',
    description: 'Tiêu đề hiển thị trên app Camera Station sau khi quét.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  matchTitle?: string;

  @ApiPropertyOptional({
    example: true,
    default: false,
    description:
      'true ⇒ Camera Station tự phát sóng ngay sau khi quét, không cần bấm thêm.',
  })
  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
}
