export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  communityId: string | null;
}
