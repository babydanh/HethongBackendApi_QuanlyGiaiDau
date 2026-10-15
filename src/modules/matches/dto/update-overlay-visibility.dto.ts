import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn } from 'class-validator';
import type { OverlayKind } from '../overlay-visibility';

export class UpdateOverlayVisibilityDto {
  @ApiProperty({
    enum: ['H2H', 'BRACKET'],
    example: 'H2H',
    description:
      'H2H = banner đối đầu; BRACKET = bảng nhánh. Bật một loại sẽ tắt loại còn lại.',
  })
  @IsIn(['H2H', 'BRACKET'])
  kind: OverlayKind;

  @ApiProperty({
    example: true,
    description:
      'true = bật overlay được chọn; false = tắt overlay đó, giữ nguyên overlay kia',
  })
  @IsBoolean()
  visible: boolean;
}
