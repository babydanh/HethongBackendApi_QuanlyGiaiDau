"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const register_dto_1 = require("./dto/register.dto");
const login_dto_1 = require("./dto/login.dto");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const skip_app_key_decorator_1 = require("../../common/decorators/skip-app-key.decorator");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const jwt_refresh_auth_guard_1 = require("../../common/guards/jwt-refresh-auth.guard");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const google_auth_guard_1 = require("./guards/google-auth.guard");
let AuthController = class AuthController {
    authService;
    constructor(authService) {
        this.authService = authService;
    }
    async register(registerDto) {
        return await this.authService.register(registerDto);
    }
    async login(loginDto, req, res) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        const responseData = await this.authService.login(loginDto, userAgent, ipAddress);
        this.setTokensCookies(res, responseData.accessToken, responseData.refreshToken);
        delete responseData.accessToken;
        delete responseData.refreshToken;
        return responseData;
    }
    async refresh(req, res) {
        const refreshToken = req.user.refreshToken;
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        const responseData = await this.authService.refreshToken(refreshToken, userAgent, ipAddress);
        this.setTokensCookies(res, responseData.accessToken, responseData.refreshToken);
        delete responseData.accessToken;
        delete responseData.refreshToken;
        return responseData;
    }
    async logout(req, res) {
        const refreshToken = req.cookies['refreshToken'];
        if (refreshToken) {
            try {
                await this.authService.logout(refreshToken);
            }
            catch (e) {
            }
        }
        const paths = ['/', '/api/v1/auth', '/api/v1/auth/google'];
        paths.forEach((p) => {
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: p,
            };
            res.clearCookie('accessToken', cookieOptions);
            res.clearCookie('refreshToken', cookieOptions);
        });
        res.clearCookie('csrf-token', {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
        });
        return { message: 'Logged out successfully' };
    }
    setTokensCookies(res, accessToken, refreshToken) {
        const oldPaths = ['/api/v1/auth', '/api/v1/auth/google'];
        oldPaths.forEach((p) => {
            const clearOpts = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: p,
            };
            res.clearCookie('accessToken', clearOpts);
            res.clearCookie('refreshToken', clearOpts);
        });
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 15 * 60 * 1000,
            path: '/',
        });
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
        const csrfToken = (0, crypto_1.randomBytes)(32).toString('hex');
        res.cookie('csrf-token', csrfToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            path: '/',
        });
    }
    googleAuth() {
    }
    async googleCallback(req, res) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        const tokens = await this.authService.oauthLogin(req.user, userAgent, ipAddress);
        this.setTokensCookies(res, tokens.accessToken, tokens.refreshToken);
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
        res.redirect(`${frontendUrl}/auth/callback`);
    }
    async mobileLogin(loginDto, req) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return await this.authService.login(loginDto, userAgent, ipAddress);
    }
    async mobileRegister(registerDto) {
        return await this.authService.register(registerDto);
    }
    async mobileRefresh(req) {
        const refreshToken = req.user.refreshToken;
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return await this.authService.refreshToken(refreshToken, userAgent, ipAddress);
    }
    async mobileGoogleLogin(body, req) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return await this.authService.googleMobileLogin(body.idToken, userAgent, ipAddress);
    }
    async mobileAppleLogin(body, req) {
        const userAgent = req.headers['user-agent'];
        const ipAddress = req.ip;
        return await this.authService.appleMobileLogin(body.idToken, body.nonce, body.fullName, userAgent, ipAddress);
    }
    async requestEmailVerification(user) {
        return await this.authService.requestEmailVerification(user.sub);
    }
    async confirmEmailVerification(body) {
        return await this.authService.confirmEmailVerification(body.token);
    }
    requestPhoneVerification() {
        throw new common_1.BadRequestException('Tính năng xác thực qua số điện thoại tạm thời bị khóa. Vui lòng sử dụng xác thực qua Email.');
    }
    confirmPhoneVerification() {
        throw new common_1.BadRequestException('Tính năng xác thực qua số điện thoại tạm thời bị khóa. Vui lòng sử dụng xác thực qua Email.');
    }
    async logoutAll(user) {
        return await this.authService.logoutAllSessions(user.sub);
    }
    async forgotPassword(body) {
        return await this.authService.forgotPassword(body.email);
    }
    async resetPassword(body) {
        return await this.authService.resetPassword(body.token, body.password);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(15, 60000)),
    (0, common_1.Post)('register'),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new user' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'User successfully registered' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: 'Bad Request' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(30, 60000)),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Login user' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User successfully logged in' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(jwt_refresh_auth_guard_1.JwtRefreshAuthGuard),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh access token' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Tokens successfully refreshed' }),
    (0, swagger_1.ApiResponse)({ status: 401, description: 'Unauthorized' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Logout user' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'User successfully logged out' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('google'),
    (0, common_1.UseGuards)(google_auth_guard_1.GoogleAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng nhập bằng Google' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "googleAuth", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, skip_app_key_decorator_1.SkipAppKey)(),
    (0, common_1.Get)('google/callback'),
    (0, common_1.UseGuards)(google_auth_guard_1.GoogleAuthGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Google OAuth callback' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCallback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('mobile/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng nhập cho Mobile App (Trả về JSON chứa tokens)' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Đăng nhập thành công' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mobileLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('mobile/register'),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng ký tài khoản cho Mobile App (Trả về JSON)' }),
    (0, swagger_1.ApiResponse)({ status: 201, description: 'Đăng ký thành công' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [register_dto_1.RegisterDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mobileRegister", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(jwt_refresh_auth_guard_1.JwtRefreshAuthGuard),
    (0, common_1.Post)('mobile/refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh access token cho Mobile App' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Refresh tokens thành công' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mobileRefresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('mobile/google'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng nhập bằng Google ID Token trên Mobile App' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Đăng nhập Google thành công' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mobileGoogleLogin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('mobile/apple'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng nhập bằng Apple Identity Token trên iOS App' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Đăng nhập Apple thành công' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "mobileAppleLogin", null);
__decorate([
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(5, 60000)),
    (0, common_1.Post)('verify-email/request'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Yêu cầu gửi email kích thực (Mock)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestEmailVerification", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(10, 60000)),
    (0, common_1.Post)('verify-email/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Xác thực kích hoạt email bằng token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "confirmEmailVerification", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(5, 60000)),
    (0, common_1.Post)('verify-phone/request'),
    (0, common_1.HttpCode)(common_1.HttpStatus.BAD_REQUEST),
    (0, swagger_1.ApiOperation)({ summary: 'Yêu cầu gửi OTP SMS kích thực số điện thoại (Tạm khóa)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestPhoneVerification", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(10, 60000)),
    (0, common_1.Post)('verify-phone/confirm'),
    (0, common_1.HttpCode)(common_1.HttpStatus.BAD_REQUEST),
    (0, swagger_1.ApiOperation)({ summary: 'Xác thực OTP số điện thoại (Tạm khóa)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "confirmPhoneVerification", null);
__decorate([
    (0, common_1.Post)('logout-all'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Đăng xuất tất cả thiết bị' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutAll", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(3, 60000, true)),
    (0, common_1.Post)('forgot-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Yêu cầu đặt lại mật khẩu' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.UseGuards)(new rate_limit_guard_1.RateLimitGuard(10, 60000)),
    (0, common_1.Post)('reset-password'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Đặt lại mật khẩu với token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resetPassword", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map