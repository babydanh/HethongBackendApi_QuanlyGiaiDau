import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { OAuthProfileDto } from './dto/oauth-profile.dto';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
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
    login(loginDto: LoginDto, req: Request, res: Response): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    refresh(req: Request & {
        user: JwtPayload & {
            refreshToken: string;
        };
    }, res: Response): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    logout(req: Request, res: Response): Promise<{
        message: string;
    }>;
    private setTokensCookies;
    googleAuth(): void;
    googleCallback(req: Request & {
        user: OAuthProfileDto;
    }, res: Response): Promise<void>;
    mobileLogin(loginDto: LoginDto, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    mobileRegister(registerDto: RegisterDto): Promise<{
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
    mobileRefresh(req: Request & {
        user: JwtPayload & {
            refreshToken: string;
        };
    }): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    mobileGoogleLogin(body: {
        idToken: string;
    }, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    mobileAppleLogin(body: {
        idToken: string;
        nonce?: string;
        fullName?: string;
    }, req: Request): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            roles: string[];
            isEmailVerified: boolean;
        };
    }>;
    requestEmailVerification(user: JwtPayload): Promise<{
        message: string;
        cooldownSeconds: number;
    }>;
    confirmEmailVerification(body: {
        token: string;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    requestPhoneVerification(): void;
    confirmPhoneVerification(): void;
    logoutAll(user: JwtPayload): Promise<{
        success: boolean;
    }>;
    forgotPassword(body: {
        email: string;
    }): Promise<{
        message: string;
    }>;
    resetPassword(body: {
        token: string;
        password: string;
    }): Promise<{
        message: string;
    }>;
}
