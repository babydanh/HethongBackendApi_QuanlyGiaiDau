import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, ValidateIf } from 'class-validator';

export class CreateChangeRequestDto {
  @ApiProperty({ enum: ['GENDER', 'EMAIL'], example: 'EMAIL' })
  @IsEnum(['GENDER', 'EMAIL'], { message: 'Loại yêu cầu không hợp lệ.' })
  requestType!: 'GENDER' | 'EMAIL';

  @ApiProperty({ example: 'new-email@example.com' })
  @ValidateIf((request) => request.requestType === 'EMAIL')
  @IsEmail({}, { message: 'Email mới không hợp lệ.' })
  @IsString({ message: 'Giá trị thay đổi phải là chuỗi.' })
  newValue!: string;
}
