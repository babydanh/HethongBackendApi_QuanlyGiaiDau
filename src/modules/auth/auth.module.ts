import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleStrategy } from './strategies/google.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('auth.jwtAccessSecret'),
        signOptions: {
          expiresIn: configService.get<string>(
            'auth.jwtAccessExpiresIn',
          ) as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, JwtRefreshStrategy, GoogleStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
