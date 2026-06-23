import { IsString, IsOptional, Matches, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John Doe Updated' })
  @IsString()
  @IsOptional()
  fullName?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar-new.png' })
  @IsString()
  @IsOptional()
  avatarUrl?: string;

  @ApiPropertyOptional({ example: '0987654321' })
  @IsString()
  @IsOptional()
  @Matches(/^(?:\+84|0[3|5|7|8|9])\d{8}$/, {
    message: 'Số điện thoại không hợp lệ. Phải là số điện thoại Việt Nam (ví dụ: 0987654321 hoặc +84987654321)',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({ example: '2000-01-01' })
  @IsDateString({}, { message: 'Ngày sinh không hợp lệ (Định dạng đúng: YYYY-MM-DD)' })
  @IsOptional()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Pickleball lover' })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional({ example: 'Nam' })
  @IsString()
  @IsOptional()
  gender?: string;

  @ApiPropertyOptional({ example: 'TP.HCM, Việt Nam' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '79', description: 'Mã tỉnh/thành phố' })
  @IsString()
  @IsOptional()
  provinceCode?: string;

  @ApiPropertyOptional({ example: 'https://example.com/cover.png' })
  @IsString()
  @IsOptional()
  coverUrl?: string;

  @ApiPropertyOptional({ example: 'Vietcombank', description: 'Tên ngân hàng nhận tiền hoàn' })
  @IsString()
  @IsOptional()
  bankName?: string;

  @ApiPropertyOptional({ example: '0071001234567', description: 'Số tài khoản ngân hàng' })
  @IsString()
  @IsOptional()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: 'NGUYEN VAN A', description: 'Tên chủ tài khoản ngân hàng' })
  @IsString()
  @IsOptional()
  bankAccountName?: string;
}
