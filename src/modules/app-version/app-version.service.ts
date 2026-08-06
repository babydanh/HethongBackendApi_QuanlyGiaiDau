import { Injectable } from '@nestjs/common';

type AppPlatform = 'android' | 'ios';

@Injectable()
export class AppVersionService {
  getVersion(platform: AppPlatform) {
    const isIos = platform === 'ios';
    return {
      platform,
      latestVersion: process.env[isIos ? 'APP_IOS_LATEST_VERSION' : 'APP_ANDROID_LATEST_VERSION'] || '1.0.6',
      minimumVersion: process.env[isIos ? 'APP_IOS_MINIMUM_VERSION' : 'APP_ANDROID_MINIMUM_VERSION'] || '1.0.0',
      storeUrl:
        process.env[isIos ? 'APP_IOS_STORE_URL' : 'APP_ANDROID_STORE_URL'] ||
        (isIos
          ? 'https://apps.apple.com/vn/app/vnsport/id6795829694'
          : 'https://play.google.com/store/apps/details?id=vn.vnsport.quanlygiaidau'),
      releaseNotes: process.env.APP_RELEASE_NOTES || '',
    };
  }
}
