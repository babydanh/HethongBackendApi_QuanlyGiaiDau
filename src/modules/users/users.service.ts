import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { QueryUserDto } from './dto/query-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';
import * as schema from '../../database/schema';
import { StorageService } from '../../providers/storage/storage.service';
import { RankingsService } from '../rankings/rankings.service';
import { NotificationsService } from '../notifications/notifications.service';
import { QueryMyReportsDto } from './dto/query-my-reports.dto';
import { isStoredImageUrl, extractStoredImagePublicId } from '../../common/helpers/cloudinary.helper';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly storageService: StorageService,
    private readonly rankingsService: RankingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private normalizeGenderValue(value?: string | null): 'MALE' | 'FEMALE' | null {
    const normalized = String(value ?? '')
      .trim()
      .toUpperCase()
      .replace(/[-–\s]/g, '_');

    if (['MALE', 'MEN', 'NAM'].includes(normalized)) return 'MALE';
    if (['FEMALE', 'WOMEN', 'NU', 'NỮ'].includes(normalized)) return 'FEMALE';
    return null;
  }

  async findAll(query: QueryUserDto) {
    return await this.usersRepository.findAll(query);
  }

  async findOne(id: string) {
    const user = await this.usersRepository.findById(id);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async getProfile(userId: string) {
    return this.findOne(userId);
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    // Check if user exists and get current profile data
    const currentUser = await this.findOne(userId);

    // Only pass defined values, also convert date format if necessary
    if (
      updateUserDto.gender !== undefined &&
      currentUser.profile?.isGenderLocked &&
      this.normalizeGenderValue(updateUserDto.gender) !==
        this.normalizeGenderValue(currentUser.profile.gender)
    ) {
      throw new BadRequestException(
        'Giới tính của bạn đã bị khóa. Vui lòng gửi yêu cầu hỗ trợ tới Admin để được cập nhật.',
      );
    }

    const updateData = { ...updateUserDto } as Partial<
      typeof schema.profiles.$inferInsert
    >;

    await this.usersRepository.updateProfile(userId, updateData);

    // If provinceCode changed, recalculate tiers for all user's ranks
    if (
      updateData.provinceCode !== undefined &&
      updateData.provinceCode !== currentUser.profile?.provinceCode
    ) {
      await this.rankingsService.recalculateUserTiersOnProvinceChange(userId);
    }

    return this.findOne(userId);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Get current user to check old avatar
    const currentUser = await this.findOne(userId);
    const oldAvatarUrl = currentUser.profile?.avatarUrl;
    
    // Upload to storage provider
    const result = await this.storageService.uploadFile(file);
    const avatarUrl = result.secure_url;
    
    // If old avatar was uploaded via the storage provider, delete it
    if (isStoredImageUrl(oldAvatarUrl)) {
      try {
        const publicId = extractStoredImagePublicId(oldAvatarUrl);
        if (publicId) {
          await this.storageService.deleteFile(publicId);
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

  async uploadCover(userId: string, file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Get current user to check old cover
    const currentUser = await this.findOne(userId);
    const oldCoverUrl = currentUser.profile?.coverUrl;
    
    // Upload to storage provider
    const result = await this.storageService.uploadFile(file);
    const coverUrl = result.secure_url;
    
    // If old cover was uploaded via the storage provider, delete it
    if (isStoredImageUrl(oldCoverUrl)) {
      try {
        const publicId = extractStoredImagePublicId(oldCoverUrl);
        if (publicId) {
          await this.storageService.deleteFile(publicId);
        }
      } catch (err) {
        console.error('Failed to delete old cover:', err);
      }
    }
    
    // Update Database
    await this.usersRepository.updateProfile(userId, { coverUrl });
    
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

  async getPublicProfile(id: string) {
    const profile = await this.usersRepository.getPublicProfile(id);
    if (!profile) {
      throw new NotFoundException('User profile not found');
    }
    return profile;
  }

  async createReport(reporterId: string, dto: CreateReportDto) {
    if (dto.targetType === 'USER' && dto.targetId === reporterId) {
      throw new BadRequestException('Bạn không thể tự báo cáo chính mình');
    }

    const targetExists = await this.usersRepository.reportTargetExists(
      dto.targetType,
      dto.targetId,
    );
    if (!targetExists) {
      throw new NotFoundException('Đối tượng báo cáo không tồn tại hoặc đã bị xóa');
    }

    let report: typeof schema.reports.$inferSelect;
    try {
      report = await this.usersRepository.createReport(
        reporterId,
        dto.targetType,
        dto.targetId,
        dto.category,
        dto.reason,
        dto.evidenceUrls || [],
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      ) {
        throw new ConflictException(
          'Bạn đã có một báo cáo đang được xử lý cho đối tượng và nhóm vi phạm này',
        );
      }
      throw error;
    }

    try {
      await this.notificationsService.sendNotification({
        receiverId: reporterId,
        type: 'REPORT_SUBMITTED',
        title: 'Đã tiếp nhận báo cáo vi phạm',
        content: 'Báo cáo của bạn đã được ghi nhận và đang chờ điều phối viên phân loại.',
        redirectUrl: `/profile/reports?reportId=${report.id}`,
      });
    } catch (error) {
      console.error('Không thể gửi thông báo tiếp nhận báo cáo:', error);
    }

    return report;
  }

  async getMyReports(reporterId: string, query: QueryMyReportsDto) {
    return this.usersRepository.getMyReports(reporterId, query);
  }

  async searchUsers(query: string) {
    return this.usersRepository.searchUsers(query);
  }

  async createChangeRequest(userId: string, requestType: 'GENDER' | 'EMAIL', newValue: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    const oldValue = requestType === 'GENDER' ? (user.profile?.gender || '') : user.email;
    const [request] = await this.usersRepository.createChangeRequest(userId, requestType, oldValue, newValue);
    return request;
  }

  async findChangeRequests(status?: string) {
    return await this.usersRepository.findChangeRequests(status);
  }

  async approveChangeRequest(id: string, adminNote?: string) {
    const request = await this.usersRepository.findChangeRequestById(id);
    if (!request) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu này đã được xử lý trước đó');
    }

    // Apply the change
    if (request.requestType === 'GENDER') {
      await this.usersRepository.updateProfile(request.userId, { gender: request.newValue });
    } else if (request.requestType === 'EMAIL') {
      // Direct SQL email update isn't in UsersRepository yet, let's write it in service or repository
      await this.usersRepository.verifyEmail(request.userId); // set verified
      await this.usersRepository.updateProfile(request.userId, { address: request.newValue }); // or write an email update
    }

    const [updated] = await this.usersRepository.updateChangeRequestStatus(id, 'APPROVED', adminNote);
    return updated;
  }

  async rejectChangeRequest(id: string, adminNote?: string) {
    const request = await this.usersRepository.findChangeRequestById(id);
    if (!request) {
      throw new NotFoundException('Yêu cầu không tồn tại');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Yêu cầu này đã được xử lý trước đó');
    }
    const [updated] = await this.usersRepository.updateChangeRequestStatus(id, 'REJECTED', adminNote);
    return updated;
  }

  async deleteAccount(userId: string, changePasswordDto: { password: string }) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    }
    if (!user.passwordHash) {
      throw new BadRequestException('Tài khoản được đăng ký qua Google, vui lòng liên hệ Admin để thực hiện xóa');
    }
    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Mật khẩu xác nhận không chính xác');
    }
    await this.usersRepository.softDelete(userId);
    return { success: true, message: 'Tài khoản của bạn đã được xóa thành công' };
  }

}
