"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const auth_controller_1 = require("./auth.controller");
const auth_repository_1 = require("./auth.repository");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const jwt_refresh_strategy_1 = require("./strategies/jwt-refresh.strategy");
const google_strategy_1 = require("./strategies/google.strategy");
const bullmq_1 = require("@nestjs/bullmq");
const users_module_1 = require("../users/users.module");
const account_sanction_module_1 = require("../../common/services/account-sanction.module");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule,
            users_module_1.UsersModule,
            account_sanction_module_1.AccountSanctionModule,
            bullmq_1.BullModule.registerQueue({
                name: 'email-delivery',
            }),
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                inject: [config_1.ConfigService],
                useFactory: (configService) => {
                    const expiresIn = configService.get('auth.jwtAccessExpiresIn') || '15m';
                    return {
                        secret: configService.get('auth.jwtAccessSecret'),
                        signOptions: { expiresIn: expiresIn },
                    };
                },
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [auth_service_1.AuthService, auth_repository_1.AuthRepository, jwt_strategy_1.JwtStrategy, jwt_refresh_strategy_1.JwtRefreshStrategy, google_strategy_1.GoogleStrategy],
        exports: [auth_service_1.AuthService, jwt_1.JwtModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map