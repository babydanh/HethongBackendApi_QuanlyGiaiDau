"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentsModule = void 0;
const common_1 = require("@nestjs/common");
const tournaments_service_1 = require("./tournaments.service");
const tournaments_controller_1 = require("./tournaments.controller");
const tournaments_repository_1 = require("./tournaments.repository");
const bracket_generator_service_1 = require("./bracket-generator.service");
const tournament_scheduler_service_1 = require("./tournament-scheduler.service");
const database_module_1 = require("../../database/database.module");
const series_module_1 = require("../series/series.module");
const redis_module_1 = require("../../providers/redis/redis.module");
const registration_lock_service_1 = require("./registration-lock.service");
const storage_module_1 = require("../../providers/storage/storage.module");
const auth_module_1 = require("../auth/auth.module");
const communities_module_1 = require("../communities/communities.module");
const matches_module_1 = require("../matches/matches.module");
let TournamentsModule = class TournamentsModule {
};
exports.TournamentsModule = TournamentsModule;
exports.TournamentsModule = TournamentsModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, series_module_1.SeriesModule, redis_module_1.RedisModule, storage_module_1.StorageModule, auth_module_1.AuthModule, communities_module_1.CommunitiesModule, matches_module_1.MatchesModule],
        controllers: [tournaments_controller_1.TournamentsController],
        providers: [
            tournaments_service_1.TournamentsService,
            tournaments_repository_1.TournamentsRepository,
            bracket_generator_service_1.BracketGeneratorService,
            tournament_scheduler_service_1.TournamentSchedulerService,
            registration_lock_service_1.RegistrationLockService,
        ],
        exports: [tournaments_service_1.TournamentsService, bracket_generator_service_1.BracketGeneratorService, registration_lock_service_1.RegistrationLockService, tournaments_repository_1.TournamentsRepository],
    })
], TournamentsModule);
//# sourceMappingURL=tournaments.module.js.map