"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MatchesModule = void 0;
const common_1 = require("@nestjs/common");
const matches_service_1 = require("./matches.service");
const matches_controller_1 = require("./matches.controller");
const matches_repository_1 = require("./matches.repository");
const database_module_1 = require("../../database/database.module");
const live_score_gateway_1 = require("./live-score.gateway");
const auth_module_1 = require("../auth/auth.module");
const rankings_module_1 = require("../rankings/rankings.module");
const redis_module_1 = require("../../providers/redis/redis.module");
let MatchesModule = class MatchesModule {
};
exports.MatchesModule = MatchesModule;
exports.MatchesModule = MatchesModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, auth_module_1.AuthModule, rankings_module_1.RankingsModule, redis_module_1.RedisModule],
        controllers: [matches_controller_1.MatchesController],
        providers: [matches_service_1.MatchesService, matches_repository_1.MatchesRepository, live_score_gateway_1.LiveScoreGateway],
        exports: [matches_service_1.MatchesService, live_score_gateway_1.LiveScoreGateway],
    })
], MatchesModule);
//# sourceMappingURL=matches.module.js.map