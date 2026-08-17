"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const bcrypt = __importStar(require("bcrypt"));
const crypto = __importStar(require("crypto"));
const jwt = __importStar(require("jsonwebtoken"));
const google_auth_library_1 = require("google-auth-library");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const auth_repository_1 = require("./auth.repository");
const users_repository_1 = require("../users/users.repository");
const invalid_credentials_exception_1 = require("./exceptions/invalid-credentials.exception");
const enums_1 = require("../../common/constants/enums");
const error_messages_1 = require("../../common/constants/error-messages");
const account_sanction_service_1 = require("../../common/services/account-sanction.service");
let AuthService = AuthService_1 = class AuthService {
    db;
    authRepository;
    jwtService;
    configService;
    usersRepository;
    emailQueue;
    accountSanctionService;
    googleClient;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(db, authRepository, jwtService, configService, usersRepository, emailQueue, accountSanctionService) {
        this.db = db;
        this.authRepository = authRepository;
        this.jwtService = jwtService;
        this.configService = configService;
        this.usersRepository = usersRepository;
        this.emailQueue = emailQueue;
        this.accountSanctionService = accountSanctionService;
        this.googleClient = new google_auth_library_1.OAuth2Client(this.configService.get('auth.googleClientId'));
    }
    async register(registerDto) {
        const email = registerDto.email.toLowerCase().trim();
        const existingUser = await this.authRepository.findUserByEmail(email);
        if (existingUser) {
            throw new common_1.ConflictException(error_messages_1.ERROR_MESSAGES.EMAIL_ALREADY_EXISTS);
        }
        const hashedPassword = await bcrypt.hash(registerDto.password, 12);
        const defaultRole = await this.authRepository.findRoleByName(enums_1.UserRole.PLAYER);
        const newUser = await this.authRepository.createUserWithProfile({ email, passwordHash: hashedPassword }, { fullName: registerDto.fullName, userId: '' }, defaultRole?.id || '');
        await this.authRepository.createDefaultUserRanks(newUser.id);
        delete newUser.passwordHash;
        return newUser;
    }
    async login(loginDto, userAgent, ipAddress) {
        const email = loginDto.email.toLowerCase().trim();
        const user = await this.authRepository.findUserByEmail(email);
        if (!user) {
            throw new invalid_credentials_exception_1.InvalidCredentialsException();
        }
        if (!user.passwordHash) {
            throw new common_1.BadRequestException('Tài khoản này được đăng ký qua Google. Vui lòng đăng nhập bằng Google.');
        }
        const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new invalid_credentials_exception_1.InvalidCredentialsException();
        }
        await this.assertAccountCanAccess(user.id);
        const roles = await this.authRepository.findUserRoles(user.id);
        await this.authRepository.createDefaultUserRanks(user.id);
        return this.generateTokens(user.id, user.email, roles, userAgent, ipAddress, user.isEmailVerified, user.isMock);
    }
    async refreshToken(refreshToken, userAgent, ipAddress) {
        const revokeResult = await this.db
            .update(schema.sessions)
            .set({ isRevoked: true, revokedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.sessions.refreshToken, refreshToken), (0, drizzle_orm_1.eq)(schema.sessions.isRevoked, false)))
            .returning();
        if (revokeResult.length === 0) {
            const oldSession = await this.authRepository.findSessionByRefreshToken(refreshToken);
            if (oldSession) {
                const fifteenSecondsAgo = new Date(Date.now() - 15000);
                if (oldSession.revokedAt && oldSession.revokedAt > fifteenSecondsAgo) {
                    const [latestSession] = await this.db
                        .select()
                        .from(schema.sessions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.sessions.userId, oldSession.userId), (0, drizzle_orm_1.eq)(schema.sessions.isRevoked, false), (0, drizzle_orm_1.gt)(schema.sessions.expiresAt, new Date())))
                        .orderBy((0, drizzle_orm_1.sql) `${schema.sessions.createdAt} DESC`)
                        .limit(1);
                    if (latestSession) {
                        await this.assertAccountCanAccess(oldSession.userId);
                        const roles = await this.authRepository.findUserRoles(oldSession.userId);
                        const [userRecord] = await this.db
                            .select({ email: schema.users.email, isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
                            .from(schema.users)
                            .where((0, drizzle_orm_1.eq)(schema.users.id, oldSession.userId))
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
                                secret: this.configService.get('auth.jwtAccessSecret'),
                                expiresIn: (this.configService.get('auth.jwtAccessExpiresIn') || '15m'),
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
                await this.db
                    .update(schema.sessions)
                    .set({ isRevoked: true, revokedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema.sessions.userId, oldSession.userId));
            }
            throw new common_1.UnauthorizedException(error_messages_1.ERROR_MESSAGES.TOKEN_INVALID);
        }
        try {
            const payload = this.jwtService.verify(refreshToken, {
                secret: this.configService.get('auth.jwtRefreshSecret'),
            });
            const roles = await this.authRepository.findUserRoles(payload.sub);
            await this.assertAccountCanAccess(payload.sub);
            const [userRecord] = await this.db
                .select({ isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
                .from(schema.users)
                .where((0, drizzle_orm_1.eq)(schema.users.id, payload.sub))
                .limit(1);
            return this.generateTokens(payload.sub, payload.email, roles, userAgent, ipAddress, userRecord?.isEmailVerified, userRecord?.isMock);
        }
        catch {
            throw new common_1.UnauthorizedException(error_messages_1.ERROR_MESSAGES.TOKEN_EXPIRED);
        }
    }
    async logout(refreshToken) {
        await this.authRepository.revokeSessionByToken(refreshToken);
        return { success: true };
    }
    async oauthLogin(oauthProfile, userAgent, ipAddress) {
        if (!oauthProfile.email) {
            oauthProfile.email = `${oauthProfile.provider.toLowerCase()}-${oauthProfile.providerUserId}@vndcsport.vn`;
        }
        const existingProvider = await this.authRepository.findAuthProvider(oauthProfile.provider, oauthProfile.providerUserId);
        if (existingProvider) {
            await this.assertAccountCanAccess(existingProvider.userId);
            const updateData = {};
            if (oauthProfile.displayName)
                updateData.fullName = oauthProfile.displayName;
            if (oauthProfile.avatarUrl)
                updateData.avatarUrl = oauthProfile.avatarUrl;
            if (Object.keys(updateData).length > 0) {
                await this.db.update(schema.profiles)
                    .set(updateData)
                    .where((0, drizzle_orm_1.eq)(schema.profiles.userId, existingProvider.userId));
            }
            await this.authRepository.createDefaultUserRanks(existingProvider.userId);
            const roles = await this.authRepository.findUserRoles(existingProvider.userId);
            const [existingUser] = await this.db
                .select({ isEmailVerified: schema.users.isEmailVerified, isMock: schema.users.isMock })
                .from(schema.users)
                .where((0, drizzle_orm_1.eq)(schema.users.id, existingProvider.userId))
                .limit(1);
            const isVirtualOAuthEmail = (oauthProfile.email || '').endsWith('@vndcsport.vn');
            if (existingUser && !existingUser.isEmailVerified && !isVirtualOAuthEmail) {
                await this.db.update(schema.users)
                    .set({ isEmailVerified: true })
                    .where((0, drizzle_orm_1.eq)(schema.users.id, existingProvider.userId));
                existingUser.isEmailVerified = true;
            }
            return this.generateTokens(existingProvider.userId, oauthProfile.email || '', roles, userAgent, ipAddress, existingUser?.isEmailVerified, existingUser?.isMock);
        }
        const normalizedEmail = oauthProfile.email?.toLowerCase().trim() || oauthProfile.email;
        oauthProfile.email = normalizedEmail;
        let user = normalizedEmail
            ? await this.authRepository.findUserByEmail(normalizedEmail)
            : null;
        const systemAdminsRaw = this.configService.get('SYSTEM_ADMINS') || '';
        const systemAdmins = systemAdminsRaw.split(',').map(email => email.trim().toLowerCase());
        const isSystemAdmin = normalizedEmail ? systemAdmins.includes(normalizedEmail) : false;
        if (!user) {
            const targetRoleName = isSystemAdmin ? enums_1.UserRole.ADMIN : enums_1.UserRole.PLAYER;
            const defaultRole = await this.authRepository.findRoleByName(targetRoleName);
            const isVirtualEmail = oauthProfile.email.endsWith('@vndcsport.vn');
            user = await this.authRepository.createOAuthUser({
                email: oauthProfile.email,
                passwordHash: null,
                isEmailVerified: !isVirtualEmail,
            }, {
                fullName: oauthProfile.displayName || oauthProfile.email.split('@')[0],
                avatarUrl: oauthProfile.avatarUrl,
                userId: ''
            }, defaultRole?.id || '');
            if (isSystemAdmin) {
                const organizerRole = await this.authRepository.findRoleByName(enums_1.UserRole.ORGANIZER);
                if (organizerRole) {
                    await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRole.id }).onConflictDoNothing();
                }
                const adminRole = await this.authRepository.findRoleByName(enums_1.UserRole.ADMIN);
                if (adminRole) {
                    await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();
                }
            }
            await this.authRepository.createDefaultUserRanks(user.id);
        }
        else {
            await this.authRepository.createDefaultUserRanks(user.id);
            if (!user.isEmailVerified) {
                await this.db.update(schema.users)
                    .set({ isEmailVerified: true })
                    .where((0, drizzle_orm_1.eq)(schema.users.id, user.id));
                user.isEmailVerified = true;
            }
            if (isSystemAdmin) {
                const organizerRole = await this.authRepository.findRoleByName(enums_1.UserRole.ORGANIZER);
                const adminRole = await this.authRepository.findRoleByName(enums_1.UserRole.ADMIN);
                const roles = await this.authRepository.findUserRoles(user.id);
                if (organizerRole && !roles.includes(enums_1.UserRole.ORGANIZER)) {
                    await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: organizerRole.id }).onConflictDoNothing();
                }
                if (adminRole && !roles.includes(enums_1.UserRole.ADMIN)) {
                    await this.db.insert(schema.userToRoles).values({ userId: user.id, roleId: adminRole.id }).onConflictDoNothing();
                }
            }
            const [profile] = await this.db.select().from(schema.profiles).where((0, drizzle_orm_1.eq)(schema.profiles.userId, user.id)).limit(1);
            if (!profile) {
                await this.db.insert(schema.profiles).values({
                    userId: user.id,
                    fullName: oauthProfile.displayName || oauthProfile.email.split('@')[0],
                    avatarUrl: oauthProfile.avatarUrl,
                });
            }
            else {
                const updateData = {};
                if (oauthProfile.displayName) {
                    updateData.fullName = oauthProfile.displayName;
                }
                if (oauthProfile.avatarUrl) {
                    updateData.avatarUrl = oauthProfile.avatarUrl;
                }
                if (Object.keys(updateData).length > 0) {
                    await this.db.update(schema.profiles).set(updateData).where((0, drizzle_orm_1.eq)(schema.profiles.userId, user.id));
                }
            }
        }
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
        await this.assertAccountCanAccess(user.id);
        const roles = await this.authRepository.findUserRoles(user.id);
        return this.generateTokens(user.id, user.email, roles, userAgent, ipAddress, user.isEmailVerified, user.isMock);
    }
    async assertAccountCanAccess(userId) {
        if (await this.accountSanctionService.hasActiveAccessBan(userId)) {
            throw new common_1.ForbiddenException('Tài khoản của bạn đang bị hạn chế truy cập.');
        }
    }
    async generateTokens(userId, email, roles, userAgent, ipAddress, isEmailVerified, isMock) {
        const payload = {
            sub: userId,
            email,
            roles,
            jti: crypto.randomUUID(),
            isEmailVerified: isEmailVerified ?? false,
            isMock: isMock ?? false,
        };
        const accessExpiresIn = this.configService.get('auth.jwtAccessExpiresIn') || '15m';
        const refreshExpiresIn = this.configService.get('auth.jwtRefreshExpiresIn') || '7d';
        const [accessToken, newRefreshToken] = await Promise.all([
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('auth.jwtAccessSecret'),
                expiresIn: accessExpiresIn,
            }),
            this.jwtService.signAsync(payload, {
                secret: this.configService.get('auth.jwtRefreshSecret'),
                expiresIn: refreshExpiresIn,
            }),
        ]);
        const refreshExpiresInStr = this.configService.get('auth.jwtRefreshExpiresIn') || '7d';
        const days = parseInt(refreshExpiresInStr.replace('d', ''), 10);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
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
                isEmailVerified: isEmailVerified ?? false,
            },
        };
    }
    async verifyGoogleIdToken(idToken) {
        try {
            const webClientId = this.configService.get('auth.googleClientId');
            const androidClientId = this.configService.get('auth.googleAndroidClientId');
            const iosClientId = this.configService.get('auth.googleIosClientId');
            const mobileClientIdsStr = this.configService.get('auth.googleMobileClientIds') || '';
            const extraMobileClientIds = mobileClientIdsStr
                .split(',')
                .map((id) => id.trim())
                .filter((id) => id.length > 0);
            const audiences = [webClientId, androidClientId, iosClientId, ...extraMobileClientIds].filter((id) => !!id && id.length > 0);
            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: audiences,
            });
            const payload = ticket.getPayload();
            if (!payload || !payload.email) {
                throw new common_1.UnauthorizedException('ID Token của Google không hợp lệ.');
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
        }
        catch {
            throw new common_1.UnauthorizedException('Xác thực Google ID Token thất bại.');
        }
    }
    async googleMobileLogin(idToken, userAgent, ipAddress) {
        const oauthProfile = await this.verifyGoogleIdToken(idToken);
        return this.oauthLogin(oauthProfile, userAgent, ipAddress);
    }
    async verifyAppleIdToken(idToken, nonce, fullName) {
        try {
            const appleClientId = this.configService.get('auth.appleClientId');
            const decodedHeader = jwt.decode(idToken, { complete: true });
            const keyId = decodedHeader?.header?.kid;
            if (!keyId || decodedHeader?.header?.alg !== 'RS256') {
                throw new common_1.UnauthorizedException('Apple Identity Token header không hợp lệ.');
            }
            const keysResponse = await fetch('https://appleid.apple.com/auth/keys');
            if (!keysResponse.ok) {
                throw new common_1.UnauthorizedException('Không tải được public key của Apple.');
            }
            const keys = (await keysResponse.json());
            const appleKey = keys.keys?.find((key) => key.kid === keyId);
            if (!appleKey?.n || !appleKey.e || appleKey.kty !== 'RSA') {
                throw new common_1.UnauthorizedException('Không tìm thấy public key Apple phù hợp.');
            }
            const publicKey = crypto.createPublicKey({
                key: { kty: 'RSA', n: appleKey.n, e: appleKey.e },
                format: 'jwk',
            });
            const decoded = jwt.verify(idToken, publicKey, {
                algorithms: ['RS256'],
                issuer: 'https://appleid.apple.com',
                audience: appleClientId,
            });
            if (!decoded || !decoded.sub) {
                throw new common_1.UnauthorizedException('Apple Identity Token không hợp lệ.');
            }
            const expectedNonce = nonce
                ? crypto.createHash('sha256').update(nonce).digest('hex')
                : undefined;
            if (expectedNonce && decoded.nonce !== expectedNonce) {
                throw new common_1.UnauthorizedException('Apple nonce không hợp lệ.');
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
        }
        catch (error) {
            this.logger.warn(`Apple token verification failed: ${error instanceof Error ? error.message : 'unknown error'}`);
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.UnauthorizedException('Xác thực Apple Token thất bại.');
        }
    }
    async appleMobileLogin(idToken, nonce, fullName, userAgent, ipAddress) {
        const oauthProfile = await this.verifyAppleIdToken(idToken, nonce, fullName);
        return this.oauthLogin(oauthProfile, userAgent, ipAddress);
    }
    async requestEmailVerification(userId) {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new common_1.BadRequestException('Không tìm thấy người dùng');
        }
        const cooldownPeriod = new Date(Date.now() - 120 * 1000);
        const [recentOtp] = await this.db
            .select()
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.userId, userId), (0, drizzle_orm_1.eq)(schema.otpCodes.type, 'EMAIL_VERIFY'), (0, drizzle_orm_1.gt)(schema.otpCodes.createdAt, cooldownPeriod)))
            .orderBy((0, drizzle_orm_1.sql) `${schema.otpCodes.createdAt} DESC`)
            .limit(1);
        if (recentOtp) {
            const remainingSeconds = Math.max(1, Math.ceil((recentOtp.createdAt.getTime() + 120 * 1000 - Date.now()) / 1000));
            throw new common_1.BadRequestException(`Vui lòng chờ ${remainingSeconds} giây trước khi yêu cầu gửi lại email xác thực.`);
        }
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentCount] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.userId, userId), (0, drizzle_orm_1.eq)(schema.otpCodes.type, 'EMAIL_VERIFY'), (0, drizzle_orm_1.gt)(schema.otpCodes.createdAt, last24h)));
        if (recentCount.count >= 5) {
            throw new common_1.BadRequestException('Bạn đã yêu cầu gửi email xác thực quá 5 lần trong 24h. Vui lòng quay lại sau 24h.');
        }
        const token = crypto.randomBytes(32).toString('hex');
        const tokenTtlMinutes = 15;
        const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60 * 1000);
        await this.db.insert(schema.otpCodes).values({
            userId,
            type: 'EMAIL_VERIFY',
            code: token,
            expiresAt,
        });
        const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3001';
        const activationLink = `${frontendUrl}/auth/verify-email?token=${token}`;
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
    async confirmEmailVerification(token) {
        const [record] = await this.db
            .select()
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.type, 'EMAIL_VERIFY'), (0, drizzle_orm_1.eq)(schema.otpCodes.code, token), (0, drizzle_orm_1.eq)(schema.otpCodes.isUsed, false), (0, drizzle_orm_1.gt)(schema.otpCodes.expiresAt, new Date())))
            .limit(1);
        if (!record) {
            throw new common_1.BadRequestException('Mã kích hoạt không hợp lệ hoặc đã hết hạn');
        }
        await this.db
            .update(schema.otpCodes)
            .set({ isUsed: true })
            .where((0, drizzle_orm_1.eq)(schema.otpCodes.id, record.id));
        await this.usersRepository.verifyEmail(record.userId);
        return { success: true, message: 'Email đã được xác thực thành công' };
    }
    async requestPhoneVerification(userId, phoneNumber) {
        const user = await this.usersRepository.findById(userId);
        if (!user) {
            throw new common_1.BadRequestException('Không tìm thấy người dùng');
        }
        const targetPhone = phoneNumber || user.profile?.phoneNumber;
        if (!targetPhone) {
            throw new common_1.BadRequestException('Vui lòng cung cấp số điện thoại cần xác thực');
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
        await this.db.insert(schema.otpCodes).values({
            userId,
            type: 'PHONE_VERIFY',
            code: otp,
            expiresAt,
        });
        if (phoneNumber && phoneNumber !== user.profile?.phoneNumber) {
            await this.usersRepository.updateProfile(userId, { phoneNumber });
        }
        this.logger.log(`[MOCK SMS] OTP sent to ${targetPhone}: ${otp}`);
        return { message: 'Mã OTP xác thực số điện thoại đã được gửi (Mocked)' };
    }
    async confirmPhoneVerification(userId, code) {
        const [record] = await this.db
            .select()
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.userId, userId), (0, drizzle_orm_1.eq)(schema.otpCodes.type, 'PHONE_VERIFY'), (0, drizzle_orm_1.eq)(schema.otpCodes.code, code), (0, drizzle_orm_1.eq)(schema.otpCodes.isUsed, false), (0, drizzle_orm_1.gt)(schema.otpCodes.expiresAt, new Date())))
            .limit(1);
        if (!record) {
            throw new common_1.BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn');
        }
        await this.db
            .update(schema.otpCodes)
            .set({ isUsed: true })
            .where((0, drizzle_orm_1.eq)(schema.otpCodes.id, record.id));
        await this.usersRepository.verifyPhone(userId);
        return { success: true, message: 'Số điện thoại đã được xác thực thành công' };
    }
    async forgotPassword(email) {
        const user = await this.authRepository.findUserByEmail(email);
        if (!user) {
            throw new common_1.BadRequestException('Email này chưa được đăng ký tài khoản.');
        }
        if (!user.passwordHash) {
            throw new common_1.BadRequestException('Tài khoản này được đăng ký qua Google. Vui lòng đăng nhập bằng Google.');
        }
        const cooldownPeriod = new Date(Date.now() - 120 * 1000);
        const [recentOtp] = await this.db
            .select()
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.userId, user.id), (0, drizzle_orm_1.eq)(schema.otpCodes.type, 'PASSWORD_RESET'), (0, drizzle_orm_1.gt)(schema.otpCodes.createdAt, cooldownPeriod)))
            .orderBy((0, drizzle_orm_1.sql) `${schema.otpCodes.createdAt} DESC`)
            .limit(1);
        if (recentOtp) {
            const remainingSeconds = Math.max(1, Math.ceil((recentOtp.createdAt.getTime() + 120 * 1000 - Date.now()) / 1000));
            throw new common_1.BadRequestException(`Vui lòng chờ ${remainingSeconds} giây trước khi yêu cầu gửi lại email đặt lại mật khẩu.`);
        }
        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [recentCount] = await this.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.userId, user.id), (0, drizzle_orm_1.eq)(schema.otpCodes.type, 'PASSWORD_RESET'), (0, drizzle_orm_1.gt)(schema.otpCodes.createdAt, last24h)));
        if (recentCount.count >= 5) {
            throw new common_1.BadRequestException('Bạn đã yêu cầu đặt lại mật khẩu quá 5 lần trong 24h. Vui lòng quay lại sau 24h.');
        }
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 120 * 1000);
        await this.db.insert(schema.otpCodes).values({
            userId: user.id,
            type: 'PASSWORD_RESET',
            code: token,
            expiresAt,
        });
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
    async resetPassword(token, newPassword) {
        const now = new Date();
        const [record] = await this.db
            .select()
            .from(schema.otpCodes)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.otpCodes.type, 'PASSWORD_RESET'), (0, drizzle_orm_1.eq)(schema.otpCodes.code, token), (0, drizzle_orm_1.eq)(schema.otpCodes.isUsed, false), (0, drizzle_orm_1.gt)(schema.otpCodes.expiresAt, now)))
            .limit(1);
        if (!record) {
            throw new common_1.BadRequestException('Token không hợp lệ hoặc đã hết hạn');
        }
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        await this.db.transaction(async (tx) => {
            await tx
                .update(schema.users)
                .set({ passwordHash: hashedPassword })
                .where((0, drizzle_orm_1.eq)(schema.users.id, record.userId));
            await tx
                .update(schema.otpCodes)
                .set({ isUsed: true })
                .where((0, drizzle_orm_1.eq)(schema.otpCodes.id, record.id));
            await tx
                .update(schema.sessions)
                .set({ isRevoked: true, revokedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema.sessions.userId, record.userId));
        });
        return { message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.' };
    }
    async logoutAllSessions(userId) {
        await this.db
            .update(schema.sessions)
            .set({ isRevoked: true, revokedAt: new Date() })
            .where((0, drizzle_orm_1.eq)(schema.sessions.userId, userId));
        return { success: true };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __param(5, (0, bullmq_1.InjectQueue)('email-delivery')),
    __metadata("design:paramtypes", [Object, auth_repository_1.AuthRepository,
        jwt_1.JwtService,
        config_1.ConfigService,
        users_repository_1.UsersRepository,
        bullmq_2.Queue,
        account_sanction_service_1.AccountSanctionService])
], AuthService);
//# sourceMappingURL=auth.service.js.map