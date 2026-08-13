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
import { BullModule } from '@nestjs/bullmq';
import { UsersModule } from '../users/users.module';
import { AccountSanctionModule } from '../../common/services/account-sanction.module';

@Module({
  imports: [
    PassportModule,
    UsersModule,
    AccountSanctionModule,
    BullModule.registerQueue({
      name: 'email-delivery',
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>('auth.jwtAccessExpiresIn') || '15m';
        return {
          secret: configService.get<string>('auth.jwtAccessSecret'),
          // Safe cast: expiresIn string value is valid for JWT SignOptions
          signOptions: { expiresIn: expiresIn as unknown as never },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, JwtStrategy, JwtRefreshStrategy, GoogleStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
