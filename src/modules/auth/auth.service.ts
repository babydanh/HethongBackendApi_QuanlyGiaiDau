import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthProfileDto } from './dto/oauth-profile.dto';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { UserRole } from '../../common/constants/enums';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('auth.googleClientId'),
    );
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.authRepository.findUserByEmail(
      registerDto.email,
    );
    if (existingUser) {
      throw new BadRequestException(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Default role PLAYER
    const defaultRole = await this.authRepository.findRoleByName(
      UserRole.PLAYER,
    );
    // Note: If role doesn't exist, it should be seeded. For now, assuming it exists.

    const newUser = await this.authRepository.createUserWithProfile(
      { email: registerDto.email, passwordHash: hashedPassword },
      { fullName: registerDto.fullName, userId: '' }, // userId will be populated in repository
      defaultRole?.id || '',
    );

    delete (newUser as { passwordHash?: string | null }).passwordHash;
    return newUser;
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const user = await this.authRepository.findUserByEmail(loginDto.email);
    if (!user) {
      throw new InvalidCredentialsException();
    }

    if (!user.passwordHash) {
      throw new BadRequestException(
        'Tài khoản này được đăng ký qua Google. Vui lòng đăng nhập bằng Google.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new InvalidCredentialsException();
    }

    const roles = await this.authRepository.findUserRoles(user.id);

    return this.generateTokens(
      user.id,
      user.email,
      roles,
      userAgent,
      ipAddress,
    );
  }

  async refreshToken(
    refreshToken: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const session =
      await this.authRepository.findSessionByRefreshToken(refreshToken);
    if (!session || session.isRevoked || session.expiresAt < new Date()) {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    // Verify the token
    try {
      const payload: { sub: string; email: string } = this.jwtService.verify(
        refreshToken,
        {
          secret: this.configService.get<string>('auth.jwtRefreshSecret'),
        },
      );

      // Revoke old session to prevent reuse
      await this.authRepository.revokeSessionByToken(refreshToken);

      const roles = await this.authRepository.findUserRoles(payload.sub);

      return this.generateTokens(
        payload.sub,
        payload.email,
        roles,
        userAgent,
        ipAddress,
      );
    } catch {
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_EXPIRED);
    }
  }

  async logout(refreshToken: string) {
    await this.authRepository.revokeSessionByToken(refreshToken);
    return { success: true };
  }

  async oauthLogin(
    oauthProfile: OAuthProfileDto,
    userAgent?: string,
    ipAddress?: string,
  ) {
    // 1. Check if provider is already linked
    const existingProvider = await this.authRepository.findAuthProvider(
      oauthProfile.provider,
      oauthProfile.providerUserId,
    );

    if (existingProvider) {
      const roles = await this.authRepository.findUserRoles(
        existingProvider.userId,
      );
      return this.generateTokens(
        existingProvider.userId,
        oauthProfile.email || '',
        roles,
        userAgent,
        ipAddress,
      );
    }

    // 2. If not linked, check if user exists by email
    let user = oauthProfile.email
      ? await this.authRepository.findUserByEmail(oauthProfile.email)
      : null;

    if (!user) {
      // 3. If no user, create a new one
      const defaultRole = await this.authRepository.findRoleByName(
        UserRole.PLAYER,
      );
      user = await this.authRepository.createOAuthUser(
        {
          email: oauthProfile.email!,
          passwordHash: null,
          isEmailVerified: true,
        },
        { 
          fullName: oauthProfile.displayName || 'User', 
          avatarUrl: oauthProfile.avatarUrl,
          userId: '' 
        },
        defaultRole?.id || '',
      );
    }

    // 4. Link provider
    await this.authRepository.createAuthProvider({
      userId: user.id,
      provider: oauthProfile.provider,
      providerUserId: oauthProfile.providerUserId,
      providerEmail: oauthProfile.email,
      providerAvatarUrl: oauthProfile.avatarUrl,
      providerDisplayName: oauthProfile.displayName,
      accessToken: oauthProfile.accessToken,
      refreshToken: oauthProfile.refreshToken,
    });

    // 5. Generate tokens
    const roles = await this.authRepository.findUserRoles(user.id);
    return this.generateTokens(
      user.id,
      user.email,
      roles,
      userAgent,
      ipAddress,
    );
  }

  private async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    userAgent?: string,
    ipAddress?: string,
  ) {
    const payload = { sub: userId, email, roles, jti: crypto.randomUUID() };

    const accessExpiresIn = this.configService.get<string>('auth.jwtAccessExpiresIn') || '15m';
    const refreshExpiresIn = this.configService.get<string>('auth.jwtRefreshExpiresIn') || '7d';

    // Safe cast: expiresIn string value is valid for JWT SignOptions
    const [accessToken, newRefreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('auth.jwtAccessSecret')!,
        expiresIn: accessExpiresIn as unknown as never,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('auth.jwtRefreshSecret')!,
        expiresIn: refreshExpiresIn as unknown as never,
      }),
    ]);

    // Calculate refresh token expiry date
    const refreshExpiresInStr =
      this.configService.get<string>('auth.jwtRefreshExpiresIn') || '7d';
    const days = parseInt(refreshExpiresInStr.replace('d', ''), 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // Save session
    await this.authRepository.createSession({
      userId,
      refreshToken: newRefreshToken,
      userAgent,
      ipAddress,
      expiresAt,
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: userId,
        email,
        roles,
      },
    };
  }

  async verifyGoogleIdToken(idToken: string): Promise<OAuthProfileDto> {
    try {
      const webClientId = this.configService.get<string>('auth.googleClientId');
      // Lấy danh sách client ID của Mobile từ cấu hình ConfigService
      const mobileClientIdsStr = this.configService.get<string>('auth.googleMobileClientIds') || '';
      const mobileClientIds = mobileClientIdsStr
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      const audiences = [webClientId, ...mobileClientIds].filter((id): id is string => !!id);

      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: audiences,
      });
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new UnauthorizedException('ID Token của Google không hợp lệ.');
      }
      return {
        provider: 'GOOGLE',
        providerUserId: payload.sub,
        email: payload.email,
        displayName: payload.name || 'User',
        avatarUrl: payload.picture,
        accessToken: undefined,
        refreshToken: undefined,
      };
    } catch {
      throw new UnauthorizedException('Xác thực Google ID Token thất bại.');
    }
  }

  async googleMobileLogin(idToken: string, userAgent?: string, ipAddress?: string) {
    const oauthProfile = await this.verifyGoogleIdToken(idToken);
    return this.oauthLogin(oauthProfile, userAgent, ipAddress);
  }
}
