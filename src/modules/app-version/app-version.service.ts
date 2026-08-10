import { Injectable, Inject } from '@nestjs/common';
import { PG_CONNECTION } from '../../database/database.module';
import * as schema from '../../database/schema';
import { inArray } from 'drizzle-orm';

type AppPlatform = 'android' | 'ios';

@Injectable()
export class AppVersionService {
  constructor(
    @Inject(PG_CONNECTION) private readonly db: any,
  ) {}

  async getVersion(platform: AppPlatform) {
    const isIos = platform === 'ios';
    const prefix = isIos ? 'APP_IOS' : 'APP_ANDROID';

    const keys = [
      `${prefix}_LATEST_VERSION`,
      `${prefix}_MINIMUM_VERSION`,
      `${prefix}_STORE_URL`,
      'APP_RELEASE_NOTES',
    ];

    const dbConfigs: Record<string, string> = {};
    try {
      const records = await this.db
        .select({ key: schema.systemConfigs.key, value: schema.systemConfigs.value })
        .from(schema.systemConfigs)
        .where(inArray(schema.systemConfigs.key, keys));

      for (const r of records) {
        dbConfigs[r.key] = r.value;
      }
    } catch (err) {
      console.error('Failed to load version configs from DB, fallback to env:', err);
    }

    const defaultLatest = '1.0.6';
    const defaultMin = '1.0.0';
    const defaultStoreUrl = isIos
      ? 'https://apps.apple.com/vn/app/vnsport/id6795829694'
      : 'https://play.google.com/store/apps/details?id=vn.vnsport.quanlygiaidau';

    return {
      platform,
      latestVersion: dbConfigs[`${prefix}_LATEST_VERSION`] || process.env[`${prefix}_LATEST_VERSION`] || defaultLatest,
      minimumVersion: dbConfigs[`${prefix}_MINIMUM_VERSION`] || process.env[`${prefix}_MINIMUM_VERSION`] || defaultMin,
      storeUrl: dbConfigs[`${prefix}_STORE_URL`] || process.env[`${prefix}_STORE_URL`] || defaultStoreUrl,
      releaseNotes: dbConfigs['APP_RELEASE_NOTES'] || process.env.APP_RELEASE_NOTES || '',
    };
  }
}
