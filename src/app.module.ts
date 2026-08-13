import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { UserAwareThrottlerGuard } from './common/guards/user-aware-throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { envValidationSchema } from './config/env.validation';
import databaseConfig from './config/database.config';
import authConfig from './config/auth.config';
import aiConfig from './config/ai.config';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { VerifiedGuard } from './common/guards/verified.guard';
import { AppKeyGuard } from './common/guards/app-key.guard';
import { AccountBanGuard } from './common/guards/account-ban.guard';
import { AccountSanctionModule } from './common/services/account-sanction.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CommunitiesModule } from './modules/communities/communities.module';
import { VenuesModule } from './modules/venues/venues.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { MatchesModule } from './modules/matches/matches.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { SocialModule } from './modules/social/social.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { UploadModule } from './modules/upload/upload.module';
import { RegionsModule } from './modules/regions/regions.module';
import { AdminModule } from './modules/admin/admin.module';
import { SeriesModule } from './modules/series/series.module';
import { RedisModule } from './providers/redis/redis.module';
import { MailModule } from './providers/mail/mail.module';
import { AiModule } from './modules/ai/ai.module';
import { LivestreamModule } from './modules/livestream/livestream.module';
import { AppVersionModule } from './modules/app-version/app-version.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [databaseConfig, authConfig, aiConfig],
      validationSchema: envValidationSchema,
    }),
    AccountSanctionModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST') || 'localhost',
          port: Number(configService.get<number>('REDIS_PORT')) || 6379,
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),
    RedisModule,
    MailModule,
    ThrottlerModule.forRoot([
      // Dev: 50000 req/60s; Production: 50000 req/60s (loại bỏ hoàn toàn bẫy 429 rate limit khi cuộn trang)
      { name: 'default', ttl: 60000, limit: 50000 },
      // Endpoint nhạy cảm (auth, payment)
      { name: 'sensitive', ttl: 30000, limit: process.env.NODE_ENV === 'production' ? 60 : 300 },
      // Endpoint cực nhạy (login, register) — chống brute force
      { name: 'strict', ttl: 60000, limit: process.env.NODE_ENV === 'production' ? 20 : 150 },
    ]),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    CommunitiesModule,
    VenuesModule,
    TournamentsModule,
    MatchesModule,
    RankingsModule,
    PaymentsModule,
    SocialModule,
    ChatModule,
    NotificationsModule,
    AuditModule,
    UploadModule,
    RegionsModule,
    AdminModule,
    SeriesModule,
    AiModule,
    LivestreamModule,
    AppVersionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AppKeyGuard,
    },
    {
      provide: APP_GUARD,
      useClass: UserAwareThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AccountBanGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: VerifiedGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
