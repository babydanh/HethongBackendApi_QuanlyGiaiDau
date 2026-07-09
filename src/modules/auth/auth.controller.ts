import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import { JwtRefreshAuthGuard } from '../../common/guards/jwt-refresh-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { OAuthProfileDto } from './dto/oauth-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(new RateLimitGuard(5, 60000))
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Public()
  @UseGuards(new RateLimitGuard(10, 60000))
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'User successfully logged in' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    const responseData = await this.authService.login(loginDto, userAgent, ipAddress);
    
    // Set Cookies
    this.setTokensCookies(res, responseData.accessToken, responseData.refreshToken);
    
    // Delete tokens from response body for security
    delete (responseData as { accessToken?: string }).accessToken;
    delete (responseData as { refreshToken?: string }).refreshToken;
    
    return responseData;
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async refresh(@Req() req: Request & { user: JwtPayload & { refreshToken: string } }, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.user.refreshToken;

    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    const responseData = await this.authService.refreshToken(
      refreshToken,
      userAgent,
      ipAddress,
    );

    // Set new cookies
    this.setTokensCookies(res, responseData.accessToken, responseData.refreshToken);

    // Delete tokens from body
    delete (responseData as { accessToken?: string }).accessToken;
    delete (responseData as { refreshToken?: string }).refreshToken;

    return responseData;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    if (refreshToken) {
      try {
        await this.authService.logout(refreshToken);
      } catch (e) {
        // Ignore error during session revocation to ensure cookies are always cleared in response
      }
    }
    
    const paths = ['/', '/api/v1/auth', '/api/v1/auth/google'];
    paths.forEach((p) => {
      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: p,
      };
      res.clearCookie('accessToken', cookieOptions);
      res.clearCookie('refreshToken', cookieOptions);
    });
    
    return { message: 'Logged out successfully' };
  }

  private setTokensCookies(res: Response, accessToken: string, refreshToken: string) {
    // Clear old path-fragmented cookies to prevent them from hijacking future requests
    const oldPaths = ['/api/v1/auth', '/api/v1/auth/google'];
    oldPaths.forEach((p) => {
      const clearOpts = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: p,
      };
      res.clearCookie('accessToken', clearOpts);
      res.clearCookie('refreshToken', clearOpts);
    });

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 mins
      path: '/',
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }



  // --- OAuth Routes ---

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Đăng nhập bằng Google' })
  googleAuth() {
    // Guard will automatically redirect to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(
    @Req() req: Request & { user: OAuthProfileDto },
    @Res() res: Response,
  ) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;

    const tokens = await this.authService.oauthLogin(
      req.user,
      userAgent,
      ipAddress,
    );

    // Redirect to frontend
    // Set cookies before redirect
    this.setTokensCookies(res, tokens.accessToken, tokens.refreshToken);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/auth/callback`);
  }

  @Public()
  @Post('mobile/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập cho Mobile App (Trả về JSON chứa tokens)' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công' })
  async mobileLogin(@Body() loginDto: LoginDto, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return await this.authService.login(loginDto, userAgent, ipAddress);
  }

  @Public()
  @Post('mobile/register')
  @ApiOperation({ summary: 'Đăng ký tài khoản cho Mobile App (Trả về JSON)' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công' })
  async mobileRegister(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Public()
  @UseGuards(JwtRefreshAuthGuard)
  @Post('mobile/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token cho Mobile App' })
  @ApiResponse({ status: 200, description: 'Refresh tokens thành công' })
  async mobileRefresh(@Req() req: Request & { user: JwtPayload & { refreshToken: string } }) {
    const refreshToken = req.user.refreshToken;
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return await this.authService.refreshToken(
      refreshToken,
      userAgent,
      ipAddress,
    );
  }

  @Public()
  @Post('mobile/google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập bằng Google ID Token trên Mobile App' })
  @ApiResponse({ status: 200, description: 'Đăng nhập Google thành công' })
  async mobileGoogleLogin(@Body() body: { idToken: string }, @Req() req: Request) {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip;
    return await this.authService.googleMobileLogin(body.idToken, userAgent, ipAddress);
  }

  @UseGuards(new RateLimitGuard(5, 60000))
  @Post('verify-email/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu gửi email kích thực (Mock)' })
  async requestEmailVerification(@CurrentUser() user: JwtPayload) {
    return await this.authService.requestEmailVerification(user.sub);
  }

  @Public()
  @UseGuards(new RateLimitGuard(10, 60000))
  @Post('verify-email/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác thực kích hoạt email bằng token' })
  async confirmEmailVerification(@Body() body: { token: string }) {
    return await this.authService.confirmEmailVerification(body.token);
  }

  @Public()
  @UseGuards(new RateLimitGuard(5, 60000))
  @Post('verify-phone/request')
  @HttpCode(HttpStatus.BAD_REQUEST)
  @ApiOperation({ summary: 'Yêu cầu gửi OTP SMS kích thực số điện thoại (Tạm khóa)' })
  requestPhoneVerification() {
    throw new BadRequestException('Tính năng xác thực qua số điện thoại tạm thời bị khóa. Vui lòng sử dụng xác thực qua Email.');
  }

  @Public()
  @UseGuards(new RateLimitGuard(10, 60000))
  @Post('verify-phone/confirm')
  @HttpCode(HttpStatus.BAD_REQUEST)
  @ApiOperation({ summary: 'Xác thực OTP số điện thoại (Tạm khóa)' })
  confirmPhoneVerification() {
    throw new BadRequestException('Tính năng xác thực qua số điện thoại tạm thời bị khóa. Vui lòng sử dụng xác thực qua Email.');
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất tất cả thiết bị' })
  async logoutAll(@CurrentUser() user: JwtPayload) {
    return await this.authService.logoutAllSessions(user.sub);
  }

  @Public()
  @UseGuards(new RateLimitGuard(5, 60000))
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu đặt lại mật khẩu' })
  async forgotPassword(@Body() body: { email: string }) {
    return await this.authService.forgotPassword(body.email);
  }

  @Public()
  @UseGuards(new RateLimitGuard(10, 60000))
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu với token' })
  async resetPassword(@Body() body: { token: string; password: string }) {
    return await this.authService.resetPassword(body.token, body.password);
  }
}
