import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import type { AppDb } from '../../database/db.types';
import { AuthRepository } from './auth.repository';
import { UsersRepository } from '../users/users.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthProfileDto } from './dto/oauth-profile.dto';
import { AccountSanctionService } from '../../common/services/account-sanction.service';
export declare class AuthService {
    private readonly db;
    private readonly authRepository;
    private readonly jwtService;
    private readonly configService;
    private readonly usersRepository;
    private readonly emailQueue;
    private readonly accountSanctionService;
    private readonly googleClient;
    private readonly logger;
    constructor(db: AppDb, authRepository: AuthRepository, jwtService: JwtService, configService: ConfigService, usersRepository: UsersRepository, emailQueue: Queue, accountSanctionService: AccountSanctionService);
    register(registerDto: RegisterDto): Promise<{
        id: string;
        email: string;
        passwordHash: string | null;
        isEmailVerified: boolean;
        isPhoneVerified: boolean;
        isMock: boolean;
        acceptedTosAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
        deletedAt: Date | null;
    }>;
    login(loginDto: LoginDto, userAgent?: string, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    refreshToken(refreshToken: string, userAgent?: string, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    logout(refreshToken: string): Promise<{
        success: boolean;
    }>;
    oauthLogin(oauthProfile: OAuthProfileDto, userAgent?: string, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    private assertAccountCanAccess;
    private generateTokens;
    verifyGoogleIdToken(idToken: string): Promise<OAuthProfileDto>;
    googleMobileLogin(idToken: string, userAgent?: string, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    verifyAppleIdToken(idToken: string, nonce?: string, fullName?: string): Promise<OAuthProfileDto>;
    appleMobileLogin(idToken: string, nonce?: string, fullName?: string, userAgent?: string, ipAddress?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    requestEmailVerification(userId: string): Promise<{
        message: string;
        cooldownSeconds: number;
    }>;
    confirmEmailVerification(token: string): Promise<{
        success: boolean;
        message: string;
    }>;
    requestPhoneVerification(userId: string, phoneNumber?: string): Promise<{
        message: string;
    }>;
    confirmPhoneVerification(userId: string, code: string): Promise<{
        success: boolean;
        message: string;
    }>;
    forgotPassword(email: string): Promise<{
        message: string;
    }>;
    resetPassword(token: string, newPassword: string): Promise<{
        message: string;
    }>;
    logoutAllSessions(userId: string): Promise<{
        success: boolean;
    }>;
}
