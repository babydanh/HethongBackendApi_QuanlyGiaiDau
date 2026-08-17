"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminModule = void 0;
const common_1 = require("@nestjs/common");
const admin_service_1 = require("./admin.service");
const admin_controller_1 = require("./admin.controller");
const admin_tickets_controller_1 = require("./admin-tickets.controller");
const admin_moderation_controller_1 = require("./admin-moderation.controller");
const admin_config_controller_1 = require("./admin-config.controller");
const database_module_1 = require("../../database/database.module");
const rankings_module_1 = require("../rankings/rankings.module");
let AdminModule = class AdminModule {
};
exports.AdminModule = AdminModule;
exports.AdminModule = AdminModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, rankings_module_1.RankingsModule],
        controllers: [
            admin_controller_1.AdminController,
            admin_tickets_controller_1.AdminTicketsController,
            admin_moderation_controller_1.AdminModerationController,
            admin_config_controller_1.AdminConfigController,
        ],
        providers: [admin_service_1.AdminService],
        exports: [admin_service_1.AdminService],
    })
], AdminModule);
//# sourceMappingURL=admin.module.js.map