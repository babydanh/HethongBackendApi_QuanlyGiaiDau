import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { UserRole } from '../../../common/constants/enums';

/**
 * Replaces only a user's global platform roles. It never affects community
 * membership roles or tournament staff/referee assignments.
 */
export class UpdateSystemRolesDto {
  @ApiProperty({
    type: [String],
    enum: UserRole,
    example: [UserRole.PLAYER, UserRole.ORGANIZER],
    description: 'Các vai trò hệ thống đã tồn tại để áp dụng cho người dùng.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  roles: UserRole[];
}
