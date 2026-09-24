import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TournamentsRepository } from '../tournaments.repository';
import { TournamentAccessService } from './tournament-access.service';
import { StorageService } from '../../../providers/storage/storage.service';
import {
  extractStoredImagePublicId,
  isStoredImageUrl,
} from '../../../common/helpers/cloudinary.helper';
import { mapTournamentFormat } from '../utils/tournament-presentation';


@Injectable()
export class TournamentMediaService {
  constructor(
    private readonly tournamentsRepository: TournamentsRepository,
    private readonly storageService: StorageService,
    private readonly tournamentAccessService: TournamentAccessService,
  ) {}
  async cleanupTournamentImages(tournament: {
    galleryImages?: string[] | null;
    bannerUrl?: string | null;
    logoUrl?: string | null;
  }) {
    const urls: string[] = [];

    if (tournament.bannerUrl) urls.push(tournament.bannerUrl);
    if (tournament.logoUrl) urls.push(tournament.logoUrl);
    if (tournament.galleryImages) urls.push(...tournament.galleryImages);

    for (const url of urls) {
      if (isStoredImageUrl(url)) {
        try {
          const publicId = extractStoredImagePublicId(url);
          if (publicId) {
            await this.storageService.deleteFile(publicId);
          }
        } catch (err) {
          console.error('Failed to delete tournament image from storage:', err);
        }
      }
    }
  }
  async uploadRegistrationAttachment(
    tournamentId: string,
    userId: string,
    fieldId: string | undefined,
    file: Express.Multer.File,
    assertRegistrationAccessible: (tournament: {
      status?: string | null;
      inviteCode?: string | null;
      registrationStartDate?: Date | string | null;
      registrationEndDate?: Date | string | null;
      isRegistrationLocked?: boolean | null;
    }) => void,
  ) {
    void userId;

    if (!file?.buffer || !file.originalname || !file.mimetype) {
      throw new BadRequestException('Tệp tải lên không hợp lệ');
    }
    if (!fieldId) {
      throw new BadRequestException('Thiếu mã trường tệp đăng ký');
    }

    const tournament = await this.tournamentsRepository.findById(tournamentId);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    assertRegistrationAccessible(tournament);

    const tournamentConfig = (tournament.tournamentConfig ?? {}) as Record<
      string,
      unknown
    >;
    const registrationForm =
      tournamentConfig.registrationForm &&
      typeof tournamentConfig.registrationForm === 'object' &&
      !Array.isArray(tournamentConfig.registrationForm)
        ? (tournamentConfig.registrationForm as Record<string, unknown>)
        : null;
    if (!registrationForm || registrationForm.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'Biểu mẫu đăng ký nâng cao chưa được phát hành',
      );
    }

    const fields = Array.isArray(registrationForm.fields)
      ? registrationForm.fields.filter(
          (field): field is Record<string, unknown> =>
            Boolean(
              field && typeof field === 'object' && !Array.isArray(field),
            ),
        )
      : [];
    const field = fields.find((candidate) => candidate.id === fieldId);
    if (!field || field.type !== 'FILE') {
      throw new BadRequestException('Trường tải tệp không hợp lệ');
    }

    const configuredMaxMb =
      typeof field.maxFileSizeMb === 'number' &&
      Number.isFinite(field.maxFileSizeMb) &&
      field.maxFileSizeMb > 0
        ? field.maxFileSizeMb
        : 10;
    const maxBytes = Math.min(configuredMaxMb, 10) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `Tệp vượt quá giới hạn ${Math.min(configuredMaxMb, 10)} MB`,
      );
    }

    const acceptedFileTypes = Array.isArray(field.acceptedFileTypes)
      ? field.acceptedFileTypes.filter(
          (type): type is string =>
            typeof type === 'string' && type.trim().length > 0,
        )
      : [];
    if (acceptedFileTypes.length > 0) {
      const mimeType = file.mimetype.toLowerCase();
      const originalName = file.originalname.toLowerCase();
      const matchesAcceptedType = acceptedFileTypes.some((rawType) =>
        rawType
          .split(',')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
          .some((acceptedType) => {
            if (acceptedType === '*/*') return true;
            if (acceptedType.endsWith('/*')) {
              return mimeType.startsWith(`${acceptedType.slice(0, -1)}`);
            }
            if (acceptedType.startsWith('.')) {
              return originalName.endsWith(acceptedType);
            }
            return mimeType === acceptedType;
          }),
      );
      if (!matchesAcceptedType) {
        throw new BadRequestException('Định dạng tệp không được chấp nhận');
      }
    }

    const result = await this.storageService.uploadFile(
      file,
      'tournahub/registration-attachments',
    );
    if (!('secure_url' in result) || !result.secure_url || !result.public_id) {
      throw new BadRequestException('Không thể tải tệp lên bộ nhớ');
    }

    return {
      url: result.secure_url,
      publicId: result.public_id,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }
  async getGallery(id: string) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException(
        'Thư viện ảnh chỉ dành cho giải đấu công khai',
      );
    }
    return tournament.galleryImages || [];
  }

  async addGalleryImage(
    id: string,
    userId: string,
    url: string,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException(
        'Thư viện ảnh chỉ dành cho giải đấu công khai',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền thêm ảnh thư viện');
    }

    const galleryImages = [...(tournament.galleryImages || []), url];
    const updated = await this.tournamentsRepository.update(id, userId, {
      galleryImages,
    });
    return mapTournamentFormat(updated);
  }

  async removeGalleryImage(
    id: string,
    userId: string,
    index: number,
    systemRoles: string[] = [],
  ) {
    const tournament = await this.tournamentsRepository.findById(id);
    if (!tournament) {
      throw new NotFoundException('Giải đấu không tồn tại');
    }
    if (tournament.tournamentType !== 'PUBLIC') {
      throw new BadRequestException(
        'Thư viện ảnh chỉ dành cho giải đấu công khai',
      );
    }

    const isAuthorized = await this.tournamentAccessService.isManager(tournament, userId, systemRoles);
    if (!isAuthorized) {
      throw new ForbiddenException('Bạn không có quyền xóa ảnh thư viện');
    }

    const currentImages = tournament.galleryImages || [];
    if (index < 0 || index >= currentImages.length) {
      throw new BadRequestException('Chỉ số ảnh thư viện không hợp lệ');
    }

    const removedUrl = currentImages[index];

    // Delete the image from Cloudinary before removing from DB
    if (isStoredImageUrl(removedUrl)) {
      try {
        const publicId = extractStoredImagePublicId(removedUrl);
        if (publicId) {
          await this.storageService.deleteFile(publicId);
        }
      } catch (err) {
        // Log error but don't stop the removal process
        console.error('Failed to delete gallery image from storage:', err);
      }
    }

    const galleryImages = currentImages.filter((_, idx) => idx !== index);
    const updated = await this.tournamentsRepository.update(id, userId, {
      galleryImages,
    });
    return mapTournamentFormat(updated);
  }
}
