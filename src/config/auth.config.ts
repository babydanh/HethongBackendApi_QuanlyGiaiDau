import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ||
    (process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/api/v1/auth/google/callback`
      : 'https://sporto.asia/api/v1/auth/google/callback'),
  googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID || '',
  googleIosClientId: process.env.GOOGLE_IOS_CLIENT_ID || '',
  googleMobileClientIds: [
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_MOBILE_CLIENT_IDS,
  ].filter(Boolean).join(','),
  facebookAppId: process.env.FACEBOOK_APP_ID,
  facebookAppSecret: process.env.FACEBOOK_APP_SECRET,
  facebookCallbackUrl:
    process.env.FACEBOOK_CALLBACK_URL ||
    'http://localhost:3000/api/v1/auth/facebook/callback',
  appleClientId: process.env.APPLE_CLIENT_ID || 'com.Sporto.app',
}));
