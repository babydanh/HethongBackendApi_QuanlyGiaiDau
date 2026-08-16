import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
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
import { AccountSanctionService } from '../../common/services/account-sanction.service';

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
    private readonly accountSanctionService: AccountSanctionService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('auth.googleClientId'),
    );
  }

  async register(registerDto: RegisterDto) {
    const email = registerDto.email.toLowerCase().trim();
    const existingUser = await this.authRepository.findUserByEmail(email);
    if (existingUser) {
      throw new ConflictException(ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
    }

    const hashedPassword = await bcrypt.hash(registerDto.password, 12);

    // Default role PLAYER
    const defaultRole = await this.authRepository.findRoleByName(
      UserRole.PLAYER,
    );
    // Note: If role doesn't exist, it should be seeded. For now, assuming it exists.

    const newUser = await this.authRepository.createUserWithProfile(
      { email, passwordHash: hashedPassword },
      { fullName: registerDto.fullName, userId: '' }, // userId will be populated in repository
      defaultRole?.id || '',
    );

    // Tạo userRanks mặc định (ELO 1000) cho tất cả category
    await this.authRepository.createDefaultUserRanks(newUser.id);

    delete (newUser as { passwordHash?: string | null }).passwordHash;
    return newUser;
  }

  async login(loginDto: LoginDto, userAgent?: string, ipAddress?: string) {
    const email = loginDto.email.toLowerCase().trim();
    const user = await this.authRepository.findUserByEmail(email);
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

    await this.assertAccountCanAccess(user.id);

    const roles = await this.authRepository.findUserRoles(user.id);

    // Tạo userRanks mặc định nếu chưa có
    await this.authRepository.createDefaultUserRanks(user.id);

    return this.generateTokens(
      user.id,
      user.email,
      roles,
      userAgent,
      ipAddress,
      user.isEmailVerified,
      user.isMock,
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
      // Grace period check: Nếu session vừa bị revoke trong 15s qua (do race condition giữa các request đồng thời)
      const oldSession = await this.authRepository.findSessionByRefreshToken(refreshToken);
      if (oldSession) {
        const fifteenSecondsAgo = new Date(Date.now() - 15000);
        if (oldSession.revokedAt && oldSession.revokedAt > fifteenSecondsAgo) {
          // Token này vừa mới được refresh thành công bởi một request song song!
          // Lấy session active mới nhất của user để cấp token mới mà không hủy phiên
          const [latestSession] = await this.db
            .select()
            .from(schema.sessions)
            .where(
              and(
                eq(schema.sessions.userId, oldSession.userId),
                eq(schema.sessions.isRevoked, false),
                gt(schema.sessions.expiresAt, new Date()),
              ),
            )
            .orderBy(sql`${schema.sessions.createdAt} DESC`)
            .limit(1);

          if (latestSession) {
            await this.assertAccountCanAccess(oldSession.userId);
            const roles = await this.authRepository.findUserRoles(oldSession.userId);
            const [userRecord] = await this.db
              .select({ email: schema.users.email, isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
              .from(schema.users)
              .where(eq(schema.users.id, oldSession.userId))
              .limit(1);

            return {
              accessToken: await this.jwtService.signAsync({
                sub: oldSession.userId,
                email: userRecord?.email || '',
                roles,
                jti: crypto.randomUUID(),
                isEmailVerified: userRecord?.isEmailVerified ?? false,
                isMock: userRecord?.isMock ?? false,
              }, {
                secret: this.configService.get<string>('auth.jwtAccessSecret')!,
                expiresIn: (this.configService.get<string>('auth.jwtAccessExpiresIn') || '15m') as unknown as never,
              }),
              refreshToken: latestSession.refreshToken,
              user: {
                id: oldSession.userId,
                email: userRecord?.email || '',
                roles,
                isEmailVerified: userRecord?.isEmailVerified ?? false,
              },
            };
          }
        }

        // Nếu token đã bị hỏng/sử dụng lại từ lâu (>15s) -> Phát hiện replay attack -> Revoke tất cả sessions
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

      await this.assertAccountCanAccess(payload.sub);

      const [userRecord] = await this.db
        .select({ isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
        .from(schema.users)
        .where(eq(schema.users.id, payload.sub))
        .limit(1);

      return this.generateTokens(
        payload.sub,
        payload.email,
        roles,
        userAgent,
        ipAddress,
        userRecord?.isEmailVerified,
        userRecord?.isMock,
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
    // Nếu tài khoản OAuth không cung cấp email, tự động sinh email ảo dựa trên ID nhà phát hành
    if (!oauthProfile.email) {
      oauthProfile.email = `${oauthProfile.provider.toLowerCase()}-${oauthProfile.providerUserId}@vndcsport.vn`;
    }

    // 1. Check if provider is already linked
    const existingProvider = await this.authRepository.findAuthProvider(
      oauthProfile.provider,
      oauthProfile.providerUserId,
    );

    if (existingProvider) {
      await this.assertAccountCanAccess(existingProvider.userId);
      // Cập nhật lại fullName và avatarUrl mới nhất từ OAuth sang Profile
      const updateData: Partial<typeof schema.profiles.$inferInsert> = {};
      if (oauthProfile.displayName) updateData.fullName = oauthProfile.displayName;
      if (oauthProfile.avatarUrl) updateData.avatarUrl = oauthProfile.avatarUrl;
      if (Object.keys(updateData).length > 0) {
        await this.db.update(schema.profiles)
          .set(updateData)
          .where(eq(schema.profiles.userId, existingProvider.userId));
      }

      // Tạo userRanks mặc định nếu chưa có (kể cả đã OAuth trước đó)
      await this.authRepository.createDefaultUserRanks(existingProvider.userId);

      const roles = await this.authRepository.findUserRoles(
        existingProvider.userId,
      );
      const [existingUser] = await this.db
        .select({ isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
        .from(schema.users)
        .where(eq(schema.users.id, existingProvider.userId))
        .limit(1);

      // Đăng nhập bằng OAuth là đã chứng minh sở hữu email → tự động xác minh
      // cho tài khoản liên kết từ trước (trước khi có logic auto-verify ở nhánh
      // dưới), nếu không những tài khoản này bị kẹt "Chưa xác minh" vĩnh viễn.
      // Bỏ qua email ảo @vndcsport.vn vì không phải email thật.
      const isVirtualOAuthEmail = (oauthProfile.email || '').endsWith('@vndcsport.vn');
      if (existingUser && !existingUser.isEmailVerified && !isVirtualOAuthEmail) {
        await this.db.update(schema.users)
          .set({ isEmailVerified: true })
          .where(eq(schema.users.id, existingProvider.userId));
        existingUser.isEmailVerified = true;
      }

      return this.generateTokens(
        existingProvider.userId,
        oauthProfile.email || '',
        roles,
        userAgent,
        ipAddress,
        existingUser?.isEmailVerified,
        existingUser?.isMock,
      );
    }

    // 2. If not linked, check if user exists by email (case-insensitive — giống login/register)
    const normalizedEmail = oauthProfile.email?.toLowerCase().trim() || oauthProfile.email;
    oauthProfile.email = normalizedEmail;
    let user = normalizedEmail
      ? await this.authRepository.findUserByEmail(normalizedEmail)
      : null;

    const systemAdminsRaw = this.configService.get<string>('SYSTEM_ADMINS') || '';
    const systemAdmins = systemAdminsRaw.split(',').map(email => email.trim().toLowerCase());
    const isSystemAdmin = normalizedEmail ? systemAdmins.includes(normalizedEmail) : false;

    if (!user) {
      // 3. If no user, create a new one
      const targetRoleName = isSystemAdmin ? UserRole.ADMIN : UserRole.PLAYER;
      const defaultRole = await this.authRepository.findRoleByName(targetRoleName);
      
      // Nếu email có đuôi @vndcsport.vn (email ảo tự sinh), ta để isEmailVerified: false
      const isVirtualEmail = oauthProfile.email.endsWith('@vndcsport.vn');
      
      user = await this.authRepository.createOAuthUser(
        {
          email: oauthProfile.email,
          passwordHash: null,
          isEmailVerified: !isVirtualEmail,
        },
        { 
          fullName: oauthProfile.displayName || oauthProfile.email.split('@')[0], 
          avatarUrl: oauthProfile.avatarUrl,
          userId: '' 
        },
        defaultRole?.id || '',
      );

      // Nếu là Admin hệ thống, gán thêm vai trò ORGANIZER và kiểm tra ADMIN
      if (isSystemAdmin) {
        const organizerRole = await this.authRepository.findRoleByName(UserRole.ORGANIZER);
        if (organizerRole) {
          await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRole.id }).onConflictDoNothing();
        }
        // Đảm bảo có vai trò ADMIN
        const adminRole = await this.authRepository.findRoleByName(UserRole.ADMIN);
        if (adminRole) {
          await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();
        }
      }

      // Tạo userRanks mặc định (ELO 1000) cho tất cả category
      await this.authRepository.createDefaultUserRanks(user.id);
    } else {
      // 3.1. Tạo userRanks mặc định nếu chưa có
      await this.authRepository.createDefaultUserRanks(user.id);

      // 3.2. Nếu user đã tồn tại nhưng chưa xác minh email, tự động xác minh email vì họ đã chứng minh sở hữu qua OAuth2
      if (!user.isEmailVerified) {
        await this.db.update(schema.users)
          .set({ isEmailVerified: true })
          .where(eq(schema.users.id, user.id));
        user.isEmailVerified = true;
      }

      // 3.3. Nếu là Admin đăng nhập mà chưa có đủ quyền ADMIN hoặc ORGANIZER, gán bổ sung luôn
      if (isSystemAdmin) {
        const organizerRole = await this.authRepository.findRoleByName(UserRole.ORGANIZER);
        const adminRole = await this.authRepository.findRoleByName(UserRole.ADMIN);
        const roles = await this.authRepository.findUserRoles(user.id);
        
        if (organizerRole && !roles.includes(UserRole.ORGANIZER)) {
          await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRole.id }).onConflictDoNothing();
        }
        if (adminRole && !roles.includes(UserRole.ADMIN)) {
          await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();
        }
      }

      // 3.4. Kiểm tra và cập nhật Profile nếu bị thiếu fullName hoặc avatarUrl, hoặc đồng bộ lại từ Google
      const [profile] = await this.db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id)).limit(1);
      if (!profile) {
        await this.db.insert(schema.profiles).values({
          userId: user.id,
          fullName: oauthProfile.displayName || oauthProfile.email.split('@')[0],
          avatarUrl: oauthProfile.avatarUrl,
        });
      } else {
        const updateData: Partial<typeof schema.profiles.$inferInsert> = {};
        // Luôn luôn cập nhật tên thật và avatar mới nhất từ Google OAuth
        if (oauthProfile.displayName) {
          updateData.fullName = oauthProfile.displayName;
        }
        if (oauthProfile.avatarUrl) {
          updateData.avatarUrl = oauthProfile.avatarUrl;
        }
        if (Object.keys(updateData).length > 0) {
          await this.db.update(schema.profiles).set(updateData).where(eq(schema.profiles.userId, user.id));
        }
      }
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

    // 5. Generate tokens. The existing-provider branch was checked above;
    // this also covers an existing password account linked by OAuth.
    await this.assertAccountCanAccess(user.id);
    const roles = await this.authRepository.findUserRoles(user.id);
    return this.generateTokens(
      user.id,
      user.email,
      roles,
      userAgent,
      ipAddress,
      user.isEmailVerified,
      user.isMock,
    );
  }

  private async assertAccountCanAccess(userId: string): Promise<void> {
    if (await this.accountSanctionService.hasActiveAccessBan(userId)) {
      throw new ForbiddenException('Tài khoản của bạn đang bị hạn chế truy cập.');
    }
  }

  private async generateTokens(
    userId: string,
    email: string,
    roles: string[],
    userAgent?: string,
    ipAddress?: string,
    isEmailVerified?: boolean,
    isMock?: boolean,
  ) {
    const payload = {
      sub: userId,
      email,
      roles,
      jti: crypto.randomUUID(),
      isEmailVerified: isEmailVerified ?? false,
      isMock: isMock ?? false,
    };

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
        // Client (web store) dựa vào đây để hiển thị trạng thái xác minh email.
        isEmailVerified: isEmailVerified ?? false,
      },
    };
  }

  async verifyGoogleIdToken(idToken: string): Promise<OAuthProfileDto> {
    try {
      const webClientId = this.configService.get<string>('auth.googleClientId');
      const androidClientId = this.configService.get<string>('auth.googleAndroidClientId');
      const iosClientId = this.configService.get<string>('auth.googleIosClientId');
      const mobileClientIdsStr = this.configService.get<string>('auth.googleMobileClientIds') || '';
      const extraMobileClientIds = mobileClientIdsStr
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      const audiences = [webClientId, androidClientId, iosClientId, ...extraMobileClientIds].filter(
        (id): id is string => !!id && id.length > 0,
      );

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

  async verifyAppleIdToken(idToken: string, nonce?: string, fullName?: string): Promise<OAuthProfileDto> {
    try {
      const appleClientId = this.configService.get<string>('auth.appleClientId');
      const decodedHeader = jwt.decode(idToken, { complete: true }) as {
        header?: { kid?: string; alg?: string };
      } | null;
      const keyId = decodedHeader?.header?.kid;
      if (!keyId || decodedHeader?.header?.alg !== 'RS256') {
        throw new UnauthorizedException('Apple Identity Token header không hợp lệ.');
      }

      const keysResponse = await fetch('https://appleid.apple.com/auth/keys');
      if (!keysResponse.ok) {
        throw new UnauthorizedException('Không tải được public key của Apple.');
      }
      const keys = (await keysResponse.json()) as {
        keys?: Array<{ kid?: string; kty?: string; n?: string; e?: string }>;
      };
      const appleKey = keys.keys?.find((key) => key.kid === keyId);
      if (!appleKey?.n || !appleKey.e || appleKey.kty !== 'RSA') {
        throw new UnauthorizedException('Không tìm thấy public key Apple phù hợp.');
      }

      const publicKey = crypto.createPublicKey({
        key: { kty: 'RSA', n: appleKey.n, e: appleKey.e },
        format: 'jwk',
      });
      const decoded = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: appleClientId,
      }) as {
        sub: string;
        email?: string;
        aud?: string;
        nonce?: string;
      } | null;

      if (!decoded || !decoded.sub) {
        throw new UnauthorizedException('Apple Identity Token không hợp lệ.');
      }
      // sign_in_with_apple sends the SHA-256 hash of the raw nonce in the ID token.
      // The app sends the original raw nonce so the backend must hash it before comparing.
      const expectedNonce = nonce
        ? crypto.createHash('sha256').update(nonce).digest('hex')
        : undefined;
      if (expectedNonce && decoded.nonce !== expectedNonce) {
        throw new UnauthorizedException('Apple nonce không hợp lệ.');
      }

      return {
        provider: 'APPLE',
        providerUserId: decoded.sub,
        email: decoded.email || `${decoded.sub}@privaterelay.appleid.com`,
        displayName: fullName || (decoded.email ? decoded.email.split('@')[0] : 'Apple User'),
        avatarUrl: undefined,
        accessToken: undefined,
        refreshToken: undefined,
      };
    } catch (error) {
      // Keep the client-facing message generic, but retain the reason in the
      // server log so Apple review failures can be diagnosed safely.
      this.logger.warn(
        `Apple token verification failed: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Xác thực Apple Token thất bại.');
    }
  }

  async appleMobileLogin(idToken: string, nonce?: string, fullName?: string, userAgent?: string, ipAddress?: string) {
    const oauthProfile = await this.verifyAppleIdToken(idToken, nonce, fullName);
    return this.oauthLogin(oauthProfile, userAgent, ipAddress);
  }


  async requestEmailVerification(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new BadRequestException('Không tìm thấy người dùng');
    }

    // Anti-spam cooldown check (120s)
    const cooldownPeriod = new Date(Date.now() - 120 * 1000);
    const [recentOtp] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, userId),
          eq(schema.otpCodes.type, 'EMAIL_VERIFY'),
          gt(schema.otpCodes.createdAt, cooldownPeriod),
        ),
      )
      .orderBy(sql`${schema.otpCodes.createdAt} DESC`)
      .limit(1);

    if (recentOtp) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((recentOtp.createdAt.getTime() + 120 * 1000 - Date.now()) / 1000),
      );
      throw new BadRequestException(
        `Vui lòng chờ ${remainingSeconds} giây trước khi yêu cầu gửi lại email xác thực.`,
      );
    }

    // Rate limit: Tối đa 5 lần gửi mail trong 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentCount] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, userId),
          eq(schema.otpCodes.type, 'EMAIL_VERIFY'),
          gt(schema.otpCodes.createdAt, last24h),
        ),
      );

    if (recentCount.count >= 5) {
      throw new BadRequestException('Bạn đã yêu cầu gửi email xác thực quá 5 lần trong 24h. Vui lòng quay lại sau 24h.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    // Hiệu lực 15 phút — 120 giây quá ngắn cho luồng email (queue + SMTP +
    // thời gian người dùng mở mail), token gần như luôn hết hạn trước khi bấm.
    const tokenTtlMinutes = 15;
    const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60 * 1000);

    // Lưu OTP vào DB
    await this.db.insert(schema.otpCodes).values({
      userId,
      type: 'EMAIL_VERIFY',
      code: token,
      expiresAt,
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const activationLink = `${frontendUrl}/auth/verify-email?token=${token}`;

    // Add job to BullMQ queue
    await this.emailQueue.add('send-verification', {
      to: user.email,
      subject: `Xác thực Email tài khoản Sporto (Có hiệu lực ${tokenTtlMinutes} phút)`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb; margin-bottom: 20px;">Xác thực Email tài khoản</h2>
          <p>Chào <strong>${user.profile?.fullName || 'bạn'}</strong>,</p>
          <p>Cảm ơn bạn đã tham gia hệ thống quản lý giải đấu Sporto. Vui lòng nhấp vào nút hoặc đường dẫn bên dưới để xác minh địa chỉ Email của bạn:</p>
          <div style="margin: 30px 0; text-align: center;">
            <a href="${activationLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Xác thực Email</a>
          </div>
          <p>Hoặc sao chép đường dẫn này vào trình duyệt của bạn:</p>
          <p style="word-break: break-all; color: #4b5563;"><a href="${activationLink}">${activationLink}</a></p>
          <p style="margin-top: 16px; font-size: 12px; color: #4b5563;">Nếu cần nhập mã thủ công trong trang Cài đặt, dùng mã:</p>
          <p style="font-family: monospace; font-size: 11px; word-break: break-all; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; color: #1e293b;">${token}</p>
          <p style="margin-top: 30px; font-size: 12px; color: #dc2626; border-top: 1px solid #e5e7eb; padding-top: 20px; font-weight: bold;">
            ⏱️ Đường dẫn này có hiệu lực trong vòng ${tokenTtlMinutes} phút. Nếu quá hạn vui lòng yêu cầu gửi lại email mới.
          </p>
        </div>
      `,
    });

    return {
      message: `Mã xác minh email đã được gửi qua email. Có hiệu lực trong ${tokenTtlMinutes} phút.`,
      cooldownSeconds: 120,
    };
  }

  async confirmEmailVerification(token: string) {
    const [record] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
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

    await this.usersRepository.verifyEmail(record.userId);
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
      throw new BadRequestException('Email này chưa được đăng ký tài khoản.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Tài khoản này được đăng ký qua Google. Vui lòng đăng nhập bằng Google.');
    }

    // Rate limit: Cooldown 120 giây giữa các lần gửi
    const cooldownPeriod = new Date(Date.now() - 120 * 1000);
    const [recentOtp] = await this.db
      .select()
      .from(schema.otpCodes)
      .where(
        and(
          eq(schema.otpCodes.userId, user.id),
          eq(schema.otpCodes.type, 'PASSWORD_RESET'),
          gt(schema.otpCodes.createdAt, cooldownPeriod),
        ),
      )
      .orderBy(sql`${schema.otpCodes.createdAt} DESC`)
      .limit(1);

    if (recentOtp) {
      const remainingSeconds = Math.max(
        1,
        Math.ceil((recentOtp.createdAt.getTime() + 120 * 1000 - Date.now()) / 1000),
      );
      throw new BadRequestException(
        `Vui lòng chờ ${remainingSeconds} giây trước khi yêu cầu gửi lại email đặt lại mật khẩu.`,
      );
    }

    // Rate limit: Tối đa 5 lần gửi mail reset password trong 24h
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
      throw new BadRequestException('Bạn đã yêu cầu đặt lại mật khẩu quá 5 lần trong 24h. Vui lòng quay lại sau 24h.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 120 * 1000); // Hiệu lực 120s (2 phút)

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
      subject: 'Đặt lại mật khẩu - Sporto',
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
