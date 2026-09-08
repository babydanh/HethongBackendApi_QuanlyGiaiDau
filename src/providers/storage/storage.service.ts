import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiErrorResponse, UploadApiResponse } from 'cloudinary';
import * as streamifier from 'streamifier';
import { like, or } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import { communities } from '../../database/schema/communities.schema';
import { extractStoredImagePublicId } from '../../common/helpers/cloudinary.helper';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private configService: ConfigService,
    @Inject(PG_CONNECTION) private readonly db: AppDb,
  ) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn('Storage provider config is missing! Upload might fail.');
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
    });
  }

  uploadFile(file: Express.Multer.File, folder: string = 'tournahub/avatars'): Promise<UploadApiResponse | UploadApiErrorResponse> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
        },
        (error, result) => {
          if (error) {
            return reject(new Error(error.message || 'Storage upload failed'));
          }
          if (!result) {
            return reject(new Error('Storage provider returned an empty result'));
          }
          resolve(result);
        },
      );

      streamifier.createReadStream(file.buffer).pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string): Promise<unknown> {
    // Upload URLs are reused by tournaments and galleries. Those consumers do
    // not own a file still referenced by a club, including an archived club.
    // Escape SQL LIKE wildcards; compare parsed IDs before deciding to retain.
    const escapedId = publicId.replace(/[\\%_]/g, '\\$&');
    const candidates = await this.db
      .select({ logoUrl: communities.logoUrl, bannerUrl: communities.bannerUrl })
      .from(communities)
      .where(or(
        like(communities.logoUrl, `%/${escapedId}.%`),
        like(communities.bannerUrl, `%/${escapedId}.%`),
        like(communities.logoUrl, `%/${escapedId}`),
        like(communities.bannerUrl, `%/${escapedId}`),
      ));
    if (candidates.some((club) =>
      [club.logoUrl, club.bannerUrl].some((url) =>
        extractStoredImagePublicId(url) === publicId,
      ),
    )) {
      this.logger.debug('Retained storage asset referenced by club media');
      return { result: 'skipped', reason: 'community_media_reference' };
    }
    // A failed lookup rejects before reaching Cloudinary: fail closed.
    return new Promise((resolve, reject) => {
      cloudinary.uploader.destroy(publicId, (error, result) => {
        if (error) {
          return reject(new Error(error.message || 'Storage delete failed'));
        }
        resolve(result);
      });
    });
  }
}
