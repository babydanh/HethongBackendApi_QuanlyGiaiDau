export class OAuthProfileDto {
  provider: string;
  providerUserId: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  accessToken?: string;
  refreshToken?: string;
}
