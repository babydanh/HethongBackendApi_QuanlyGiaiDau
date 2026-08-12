import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  Length,
  Matches,
} from 'class-validator';

/**
 * P2C.2 — Gán/Xoá tag BQT cho thành viên cộng đồng.
 * `tags` replace toàn bộ (mảng rỗng = xoá hết). Mỗi tag được trim,
 * 1-24 ký tự, chỉ chứa chữ cái/số/khoảng trắng/gạch dưới/gạch ngang (không emoji).
 */
export class UpdateMemberTagsDto {
  @ApiProperty({
    description:
      'Danh sách tag BQT (tối đa 5). Mỗi tag 1-24 ký tự, chỉ chữ/số/khoảng trắng/_/-, không ký tự đặc biệt hay emoji.',
    example: ['Nòng cốt', 'VĐV xuất sắc'],
    type: [String],
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @Length(1, 24, { each: true })
  @Matches(/^[\p{L}\p{N} _-]+$/u, {
    each: true,
    message:
      'Mỗi tag chỉ được chứa chữ cái, số, khoảng trắng, gạch dưới (_) và gạch ngang (-).',
  })
  tags: string[];
}
