import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class AddRefereeDto {
  @ApiProperty({ example: 'referee@gmail.com', description: 'Gmail/Email của trọng tài' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
