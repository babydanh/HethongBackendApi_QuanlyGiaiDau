import { Matches, IsString, Length } from 'class-validator';

export class CreateTagPresetDto {
  @IsString()
  @Length(1, 15)
  name!: string;

  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'Màu phải ở dạng mã hex 6 ký tự, ví dụ #22C55E' })
  color!: string;
}
