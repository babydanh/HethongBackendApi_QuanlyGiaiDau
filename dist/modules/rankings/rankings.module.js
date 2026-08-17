"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RankingsModule = void 0;
const common_1 = require("@nestjs/common");
const rankings_service_1 = require("./rankings.service");
const rankings_controller_1 = require("./rankings.controller");
const rankings_repository_1 = require("./rankings.repository");
const elo_engine_service_1 = require("./elo-engine.service");
const elo_outbox_processor_1 = require("./elo-outbox.processor");
const database_module_1 = require("../../database/database.module");
const redis_module_1 = require("../../providers/redis/redis.module");
const football_team_elo_service_1 = require("./football-team-elo.service");
let RankingsModule = class RankingsModule {
};
exports.RankingsModule = RankingsModule;
exports.RankingsModule = RankingsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, redis_module_1.RedisModule],
        controllers: [rankings_controller_1.RankingsController],
        providers: [rankings_service_1.RankingsService, rankings_repository_1.RankingsRepository, elo_engine_service_1.EloEngineService, elo_outbox_processor_1.EloOutboxProcessor, football_team_elo_service_1.FootballTeamEloService],
        exports: [rankings_service_1.RankingsService, elo_engine_service_1.EloEngineService, football_team_elo_service_1.FootballTeamEloService],
    })
], RankingsModule);
//# sourceMappingURL=rankings.module.js.map