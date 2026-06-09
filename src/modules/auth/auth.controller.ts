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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshAuthGuard } from '../../common/guards/jwt-refresh-auth.guard';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { OAuthProfileDto } from './dto/oauth-profile.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 400, description: 'Bad Request' })
  async register(@Body() registerDto: RegisterDto) {
    return await this.authService.register(registerDto);
  }

  @Public()
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
  async refresh(@Req() req: Request & { user: any }, @Res({ passthrough: true }) res: Response) {
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
    delete (responseData as any).accessToken;
    delete (responseData as any).refreshToken;

    return responseData;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User successfully logged out' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies['refreshToken'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    
    // Clear cookies
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    return { message: 'Logged out successfully' };
  }

  private setTokensCookies(res: Response, accessToken: string, refreshToken: string) {
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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
}
