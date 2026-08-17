"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const core_1 = require("@nestjs/core");
const throttler_1 = require("@nestjs/throttler");
const user_aware_throttler_guard_1 = require("./common/guards/user-aware-throttler.guard");
const schedule_1 = require("@nestjs/schedule");
const bullmq_1 = require("@nestjs/bullmq");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const users_module_1 = require("./modules/users/users.module");
const auth_module_1 = require("./modules/auth/auth.module");
const database_module_1 = require("./database/database.module");
const env_validation_1 = require("./config/env.validation");
const database_config_1 = __importDefault(require("./config/database.config"));
const auth_config_1 = __importDefault(require("./config/auth.config"));
const ai_config_1 = __importDefault(require("./config/ai.config"));
const jwt_auth_guard_1 = require("./common/guards/jwt-auth.guard");
const roles_guard_1 = require("./common/guards/roles.guard");
const csrf_guard_1 = require("./common/guards/csrf.guard");
const verified_guard_1 = require("./common/guards/verified.guard");
const app_key_guard_1 = require("./common/guards/app-key.guard");
const account_ban_guard_1 = require("./common/guards/account-ban.guard");
const account_sanction_module_1 = require("./common/services/account-sanction.module");
const categories_module_1 = require("./modules/categories/categories.module");
const communities_module_1 = require("./modules/communities/communities.module");
const venues_module_1 = require("./modules/venues/venues.module");
const tournaments_module_1 = require("./modules/tournaments/tournaments.module");
const matches_module_1 = require("./modules/matches/matches.module");
const rankings_module_1 = require("./modules/rankings/rankings.module");
const payments_module_1 = require("./modules/payments/payments.module");
const social_module_1 = require("./modules/social/social.module");
const chat_module_1 = require("./modules/chat/chat.module");
const notifications_module_1 = require("./modules/notifications/notifications.module");
const audit_module_1 = require("./modules/audit/audit.module");
const upload_module_1 = require("./modules/upload/upload.module");
const regions_module_1 = require("./modules/regions/regions.module");
const admin_module_1 = require("./modules/admin/admin.module");
const series_module_1 = require("./modules/series/series.module");
const redis_module_1 = require("./providers/redis/redis.module");
const mail_module_1 = require("./providers/mail/mail.module");
const ai_module_1 = require("./modules/ai/ai.module");
const livestream_module_1 = require("./modules/livestream/livestream.module");
const app_version_module_1 = require("./modules/app-version/app-version.module");
const football_teams_module_1 = require("./modules/football-teams/football-teams.module");
const firebase_module_1 = require("./modules/firebase/firebase.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [database_config_1.default, auth_config_1.default, ai_config_1.default],
                validationSchema: env_validation_1.envValidationSchema,
            }),
            account_sanction_module_1.AccountSanctionModule,
            bullmq_1.BullModule.forRootAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => ({
                    connection: {
                        host: configService.get('REDIS_HOST') || 'localhost',
                        port: Number(configService.get('REDIS_PORT')) || 6379,
                        password: configService.get('REDIS_PASSWORD') || undefined,
                    },
                }),
            }),
            redis_module_1.RedisModule,
            mail_module_1.MailModule,
            throttler_1.ThrottlerModule.forRoot([
                { name: 'default', ttl: 60000, limit: 50000 },
                { name: 'sensitive', ttl: 30000, limit: process.env.NODE_ENV === 'production' ? 60 : 300 },
                { name: 'strict', ttl: 60000, limit: process.env.NODE_ENV === 'production' ? 20 : 150 },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            database_module_1.DatabaseModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            categories_module_1.CategoriesModule,
            communities_module_1.CommunitiesModule,
            venues_module_1.VenuesModule,
            tournaments_module_1.TournamentsModule,
            matches_module_1.MatchesModule,
            rankings_module_1.RankingsModule,
            payments_module_1.PaymentsModule,
            social_module_1.SocialModule,
            chat_module_1.ChatModule,
            notifications_module_1.NotificationsModule,
            audit_module_1.AuditModule,
            upload_module_1.UploadModule,
            regions_module_1.RegionsModule,
            admin_module_1.AdminModule,
            series_module_1.SeriesModule,
            ai_module_1.AiModule,
            livestream_module_1.LivestreamModule,
            app_version_module_1.AppVersionModule,
            football_teams_module_1.FootballTeamsModule,
            firebase_module_1.FirebaseModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: app_key_guard_1.AppKeyGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: user_aware_throttler_guard_1.UserAwareThrottlerGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: account_ban_guard_1.AccountBanGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: roles_guard_1.RolesGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: verified_guard_1.VerifiedGuard,
            },
            {
                provide: core_1.APP_GUARD,
                useClass: csrf_guard_1.CsrfGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map