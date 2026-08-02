import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsString, ValidateIf } from 'class-validator';

export class CreateChangeRequestDto {
  @ApiProperty({ enum: ['GENDER', 'EMAIL'], example: 'EMAIL' })
  @IsEnum(['GENDER', 'EMAIL'], { message: 'Loại yêu cầu không hợp lệ.' })
  requestType!: 'GENDER' | 'EMAIL';

  @ApiProperty({
    examples: ['new-email@example.com', 'MALE', 'FEMALE', 'Nam', 'Nữ', 'Khác'],
  })
  @ValidateIf((request) => request.requestType === 'EMAIL')
  @IsEmail({}, { message: 'Email mới không hợp lệ.' })
  @ValidateIf((request) => request.requestType === 'GENDER')
  @IsIn(['MALE', 'FEMALE', 'Nam', 'Nữ', 'Khác'], {
    message: 'Giới tính mới không hợp lệ.',
  })
  @IsString({ message: 'Giá trị thay đổi phải là chuỗi.' })
  newValue!: string;
}
