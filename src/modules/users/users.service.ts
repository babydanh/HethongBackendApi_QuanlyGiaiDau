import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';
import * as schema from '../../database/schema';
import { CloudinaryService } from '../upload/cloudinary.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async findAll(query: QueryUserDto) {
    return await this.usersRepository.findAll(query);
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    delete (user as any).passwordHash;
    return user;
  }

  async getProfile(userId: string) {
    return this.findOne(userId);
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    // Check if user exists
    await this.findOne(userId);

    // Only pass defined values, also convert date format if necessary
    const updateData = { ...updateUserDto } as Partial<
      typeof schema.profiles.$inferInsert
    >;

    await this.usersRepository.updateProfile(userId, updateData);

    return this.findOne(userId);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Get current user to check old avatar
    const currentUser = await this.findOne(userId);
    const oldAvatarUrl = currentUser.profile?.avatarUrl;
    
    // Upload to Cloudinary
    const result = await this.cloudinaryService.uploadFile(file);
    const avatarUrl = result.secure_url;
    
    // If old avatar was from Cloudinary, delete it
    if (oldAvatarUrl && oldAvatarUrl.includes('res.cloudinary.com')) {
      // Extract public_id from Cloudinary URL
      // Example: https://res.cloudinary.com/.../image/upload/v12345/tournahub/avatars/xyz123.jpg
      try {
        const parts = oldAvatarUrl.split('/');
        const filename = parts.pop()?.split('.')[0]; // xyz123
        const folder = parts.pop(); // avatars
        const parentFolder = parts.pop(); // tournahub
        if (parentFolder && folder && filename) {
          const publicId = `${parentFolder}/${folder}/${filename}`;
          await this.cloudinaryService.deleteFile(publicId);
        }
      } catch (err) {
        // Log error but don't stop the upload process
        console.error('Failed to delete old avatar:', err);
      }
    }
    
    // Update Database
    await this.usersRepository.updateProfile(userId, { avatarUrl });
    
    return this.findOne(userId);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tài khoản này được đăng ký qua Google, không thể đổi mật khẩu theo cách này.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.oldPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Old password is incorrect');
    }

    const hashedNewPassword = await bcrypt.hash(
      changePasswordDto.newPassword,
      12,
    );
    await this.usersRepository.updatePassword(userId, hashedNewPassword);

    return { message: 'Password changed successfully' };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.usersRepository.softDelete(id);
    return { message: 'User deleted successfully' };
  }
}
