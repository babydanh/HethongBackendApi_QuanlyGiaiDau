"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsModule = void 0;
const common_1 = require("@nestjs/common");
const notifications_service_1 = require("./notifications.service");
const notifications_controller_1 = require("./notifications.controller");
const notifications_repository_1 = require("./notifications.repository");
const notifications_gateway_1 = require("./notifications.gateway");
const database_module_1 = require("../../database/database.module");
const auth_module_1 = require("../auth/auth.module");
let NotificationsModule = class NotificationsModule {
};
exports.NotificationsModule = NotificationsModule;
exports.NotificationsModule = NotificationsModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule, auth_module_1.AuthModule],
        controllers: [notifications_controller_1.NotificationsController],
        providers: [notifications_service_1.NotificationsService, notifications_repository_1.NotificationsRepository, notifications_gateway_1.NotificationsGateway],
        exports: [notifications_service_1.NotificationsService],
    })
], NotificationsModule);
//# sourceMappingURL=notifications.module.js.map