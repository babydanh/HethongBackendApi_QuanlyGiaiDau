import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsIn, IsString } from 'class-validator';

export class CreateChangeRequestDto {
  @ApiProperty({ enum: ['GENDER'], example: 'GENDER' })
  @IsEnum(['GENDER'], { message: 'Chỉ hỗ trợ yêu cầu thay đổi giới tính.' })
  requestType!: 'GENDER';

  @ApiProperty({
    examples: ['MALE', 'FEMALE', 'OTHER', 'Nam', 'Nữ', 'Khác'],
  })
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'Nam', 'Nữ', 'Khác'], {
    message: 'Giới tính mới không hợp lệ.',
  })
  @IsString({ message: 'Giá trị thay đổi phải là chuỗi.' })
  newValue!: string;
}
