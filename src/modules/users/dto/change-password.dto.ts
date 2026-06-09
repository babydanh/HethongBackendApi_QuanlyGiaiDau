import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword123!' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 6 })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
