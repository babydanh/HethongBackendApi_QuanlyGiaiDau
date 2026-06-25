import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { eq, and, gt, sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import * as schema from '../../database/schema';
import { AuthRepository } from './auth.repository';
import { UsersRepository } from '../users/users.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthProfileDto } from './dto/oauth-profile.dto';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { UserRole } from '../../common/constants/enums';
import { ERROR_MESSAGES } from '../../common/constants/error-messages';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersRepository: UsersRepository,
    @InjectQueue('email-delivery') private readonly emailQueue: Queue,
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
    // Bước 1: Atomic revoke — đánh dấu token này là revoked ngay lập tức
    // Nếu có 2 request đến cùng lúc, chỉ 1 cái thành công (affectedRows > 0)
    const revokeResult = await this.db
      .update(schema.sessions)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(
        and(
          eq(schema.sessions.refreshToken, refreshToken),
          eq(schema.sessions.isRevoked, false),
        ),
      )
      .returning();

    if (revokeResult.length === 0) {
      // Token đã được sử dụng (replay detected!) — revoke tất cả sessions của user
      // Tìm user từ token cũ (dù đã revoked, ta vẫn có thể tra cứu để revoke all)
      const oldSession = await this.authRepository.findSessionByRefreshToken(refreshToken);
      if (oldSession) {
        await this.db
          .update(schema.sessions)
          .set({ isRevoked: true, revokedAt: new Date() })
          .where(eq(schema.sessions.userId, oldSession.userId));
      }
      throw new UnauthorizedException(ERROR_MESSAGES.TOKEN_INVALID);
    }

    // Bước 2: Verify token
    try {
      const payload: { sub: string; email: string } = this.jwtService.verify(
        refreshToken,
        {
          secret: this.configService.get<string>('auth.jwtRefreshSecret'),
        },
      );

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

  async requestEmailVerification(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Lưu OTP vào DB thay vì in-memory Map
    await this.db.insert(schema.otpCodes).values({
      userId,
      type: 'EMAIL_VERIFY',
      code: token,
      expiresAt,
    });

    const activationLink = `http://localhost:3001/auth/verify-email?token=${token}`;

    // Add job to BullMQ queue
    await this.emailQueue.add('send-verification', {
      to: user.email,
      subject: 'Xác thực Email tài khoản VNDC Sport',
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; rounded: 8px;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">Xác thực Email tài khoản</h2>
          <p>Chào <strong>${user.profile?.fullName || 'bạn'}</strong>,</p>
          <p>Cảm ơn bạn đã tham gia hệ thống quản lý giải đấu VNDC Sport. Vui lòng nhấp vào nút hoặc đường dẫn bên dưới để xác minh địa chỉ Email của bạn:</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${activationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Xác thực Email</a>
          </div>
          <p>Hoặc sao chép đường dẫn này vào trình duyệt của bạn:</p>
          <p style="word-break: break-all; color: #4b5563;"><a href="${activationLink}">${activationLink}</a></p>
          <p style="margin-top: 30px; font-size: 12px; color: #6b7280; border-t: 1px solid #e5e7eb; padding-top: 20px;">Đường dẫn này có hiệu lực trong vòng 15 phút. Nếu bạn không yêu cầu hành động này, vui lòng bỏ qua email.</p>
        </div>
      `,
    });

    return { message: 'Mã xác minh email đã được gửi qua hàng đợi' };
  }

  async confirmEmailVerification(userId: string, token: string) {
    const [record] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, userId),
          eq(schema.otpCodes.type, 'EMAIL_VERIFY'),
          eq(schema.otpCodes.code, token),
          eq(schema.otpCodes.isUsed, false),
          gt(schema.otpCodes.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!record) {
      throw new BadRequestException('Mã kích hoạt không hợp lệ hoặc đã hết hạn');
    }

    await this.db
      .update(schema.otpCodes)
      .set({ isUsed: true })
      .where(eq(schema.otpCodes.id, record.id));

    await this.usersRepository.verifyEmail(userId);
    return { success: true, message: 'Email đã được xác thực thành công' };
  }

  async requestPhoneVerification(userId: string, phoneNumber?: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }
    const targetPhone = phoneNumber || user.profile?.phoneNumber;
    if (!targetPhone) {
      throw new BadRequestException('Vui lòng cung cấp số điện thoại cần xác thực');
    }
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

    // Lưu OTP vào DB thay vì in-memory Map
    await this.db.insert(schema.otpCodes).values({
      userId,
      type: 'PHONE_VERIFY',
      code: otp,
      expiresAt,
    });

    // Update phone number in profile if it was explicitly provided and differs
    if (phoneNumber && phoneNumber !== user.profile?.phoneNumber) {
      await this.usersRepository.updateProfile(userId, { phoneNumber });
    }

    // Mock send SMS (production: replace with SMS gateway)
    this.logger.log(`[MOCK SMS] OTP sent to ${targetPhone}: ${otp}`);

    return { message: 'Mã OTP xác thực số điện thoại đã được gửi (Mocked)' };
  }

  async confirmPhoneVerification(userId: string, code: string) {
    const [record] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, userId),
          eq(schema.otpCodes.type, 'PHONE_VERIFY'),
          eq(schema.otpCodes.code, code),
          eq(schema.otpCodes.isUsed, false),
          gt(schema.otpCodes.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!record) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
    }

    await this.db
      .update(schema.otpCodes)
      .set({ isUsed: true })
      .where(eq(schema.otpCodes.id, record.id));

    await this.usersRepository.verifyPhone(userId);
    return { success: true, message: 'Số điện thoại đã được xác thực thành công' };
  }

  async forgotPassword(email: string) {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      // Không tiết lộ user có tồn tại hay không — trả về success chung
      return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
    }

    // Rate limit: max 5 lần gửi mail reset password trong 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, user.id),
          eq(schema.otpCodes.type, 'PASSWORD_RESET'),
          gt(schema.otpCodes.createdAt, last24h),
        ),
      );

    if (recentCount.count >= 5) {
      return { message: 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 24h.' };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    await this.db.insert(schema.otpCodes).values({
      userId: user.id,
      type: 'PASSWORD_RESET',
      code: token,
      expiresAt,
    });

    // Gửi email đặt lại mật khẩu qua queue
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${token}`;
    await this.emailQueue.add('send-password-reset', {
      to: email,
      subject: 'Đặt lại mật khẩu - VNDC Sport',
      html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;">
        <h2 style="color:#2563eb;">Đặt lại mật khẩu</h2>
        <p>Chào bạn,</p>
        <p>Nhấp vào nút bên dưới để đặt lại mật khẩu (hiệu lực 15 phút):</p>
        <div style="margin:30px 0;text-align:center;">
          <a href="${resetLink}" style="background-color:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold;">
            Đặt lại mật khẩu
          </a>
        </div>
        <p style="color:#6b7280;font-size:12px;">Nếu bạn không yêu cầu, bỏ qua email này.</p></div>`,
    });

    return { message: 'Nếu email tồn tại, bạn sẽ nhận được hướng dẫn đặt lại mật khẩu.' };
  }

  async resetPassword(token: string, newPassword: string) {
    const now = new Date();

    const [record] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.type, 'PASSWORD_RESET'),
          eq(schema.otpCodes.code, token),
          eq(schema.otpCodes.isUsed, false),
          gt(schema.otpCodes.expiresAt, now),
        ),
      )
      .limit(1);

    if (!record) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await this.db.transaction(async (tx) => {
      await tx
        .update(schema.users)
        .set({ passwordHash: hashedPassword })
        .where(eq(schema.users.id, record.userId));

      await tx
        .update(schema.otpCodes)
        .set({ isUsed: true })
        .where(eq(schema.otpCodes.id, record.id));

      // Revoke all sessions for this user
      await tx
        .update(schema.sessions)
        .set({ isRevoked: true, revokedAt: new Date() })
        .where(eq(schema.sessions.userId, record.userId));
    });

    return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
  }

  async logoutAllSessions(userId: string) {
    await this.db
      .update(schema.sessions)
      .set({ isRevoked: true, revokedAt: new Date() })
      .where(eq(schema.sessions.userId, userId));
    return { success: true };
  }
}
