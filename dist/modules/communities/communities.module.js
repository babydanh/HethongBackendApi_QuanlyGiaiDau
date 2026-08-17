"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommunitiesModule = void 0;
const common_1 = require("@nestjs/common");
const communities_service_1 = require("./communities.service");
const communities_controller_1 = require("./communities.controller");
const communities_repository_1 = require("./communities.repository");
const notifications_module_1 = require("../notifications/notifications.module");
const storage_module_1 = require("../../providers/storage/storage.module");
const community_social_controller_1 = require("./community-social.controller");
const community_social_repository_1 = require("./community-social.repository");
const community_social_service_1 = require("./community-social.service");
let CommunitiesModule = class CommunitiesModule {
};
exports.CommunitiesModule = CommunitiesModule;
exports.CommunitiesModule = CommunitiesModule = __decorate([
    (0, common_1.Module)({
        imports: [notifications_module_1.NotificationsModule, storage_module_1.StorageModule],
        controllers: [communities_controller_1.CommunitiesController, community_social_controller_1.CommunitySocialController],
        providers: [communities_service_1.CommunitiesService, communities_repository_1.CommunitiesRepository, community_social_service_1.CommunitySocialService, community_social_repository_1.CommunitySocialRepository],
        exports: [communities_service_1.CommunitiesService, community_social_repository_1.CommunitySocialRepository],
    })
], CommunitiesModule);
//# sourceMappingURL=communities.module.js.map