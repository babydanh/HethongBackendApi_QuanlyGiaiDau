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
 * 1-15 ký tự, chỉ chứa chữ cái/số/khoảng trắng/gạch dưới/gạch ngang (không emoji).
 */
export class UpdateMemberTagsDto {
  @ApiProperty({
    description:
      'Danh sách tag BQT (tối đa 3). Mỗi tag 1-15 ký tự.',
    example: ['Nòng cốt', 'Smash sấm sét', 'VĐV xuất sắc'],
    type: [String],
  })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((tag) => (typeof tag === 'string' ? tag.trim() : tag))
      : value,
  )
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @Length(1, 15, { each: true })
  tags: string[];
}
