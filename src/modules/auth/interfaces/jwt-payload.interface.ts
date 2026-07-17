export interface JwtPayload {
  sub: string;
  email: string;
  roles?: string[];
  role?: string;
  communityId?: string | null;
  isEmailVerified?: boolean;
  isMock?: boolean;
}
