import {
  Controller,
  Get,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/constants/enums';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all users (Admin only)' })
  @ApiResponse({ status: 200, description: 'Return list of users' })
  async findAll(@Query() query: QueryUserDto) {
    return this.usersService.findAll(query);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Return user profile' })
  async getProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.getProfile(user.id);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get user by id (Admin only)' })
  @ApiResponse({ status: 200, description: 'Return a single user' })
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateProfile(
    @CurrentUser() user: { id: string },
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(user.id, updateUserDto);
  }

  @Post('profile/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload user avatar' })
  @ApiResponse({ status: 201, description: 'Avatar uploaded and profile updated' })
  async uploadAvatar(
    @CurrentUser() user: { id: string },
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.usersService.uploadAvatar(user.id, file);
  }

  @Patch('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @CurrentUser() user: { id: string },
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, changePasswordDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete user (Admin only)' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  async remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
