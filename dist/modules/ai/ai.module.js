"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ai_controller_1 = require("./ai.controller");
const ai_service_1 = require("./ai.service");
const tournaments_module_1 = require("../tournaments/tournaments.module");
const notifications_module_1 = require("../notifications/notifications.module");
const matches_module_1 = require("../matches/matches.module");
const payments_module_1 = require("../payments/payments.module");
const rankings_module_1 = require("../rankings/rankings.module");
let AiModule = class AiModule {
};
exports.AiModule = AiModule;
exports.AiModule = AiModule = __decorate([
    (0, common_1.Module)({
        imports: [config_1.ConfigModule, tournaments_module_1.TournamentsModule, notifications_module_1.NotificationsModule, matches_module_1.MatchesModule, payments_module_1.PaymentsModule, rankings_module_1.RankingsModule],
        controllers: [ai_controller_1.AiController],
        providers: [ai_service_1.AiService],
        exports: [ai_service_1.AiService],
    })
], AiModule);
//# sourceMappingURL=ai.module.js.map