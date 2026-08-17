"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FootballTeamsModule = void 0;
const common_1 = require("@nestjs/common");
const notifications_module_1 = require("../notifications/notifications.module");
const football_teams_controller_1 = require("./football-teams.controller");
const football_teams_repository_1 = require("./football-teams.repository");
const football_teams_service_1 = require("./football-teams.service");
let FootballTeamsModule = class FootballTeamsModule {
};
exports.FootballTeamsModule = FootballTeamsModule;
exports.FootballTeamsModule = FootballTeamsModule = __decorate([
    (0, common_1.Module)({
        imports: [notifications_module_1.NotificationsModule],
        controllers: [football_teams_controller_1.FootballTeamsController],
        providers: [football_teams_repository_1.FootballTeamsRepository, football_teams_service_1.FootballTeamsService],
        exports: [football_teams_repository_1.FootballTeamsRepository, football_teams_service_1.FootballTeamsService],
    })
], FootballTeamsModule);
//# sourceMappingURL=football-teams.module.js.map