"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SeriesModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const series_repository_1 = require("./series.repository");
const series_service_1 = require("./series.service");
const series_controller_1 = require("./series.controller");
const series_staff_controller_1 = require("./series-staff.controller");
let SeriesModule = class SeriesModule {
};
exports.SeriesModule = SeriesModule;
exports.SeriesModule = SeriesModule = __decorate([
    (0, common_1.Module)({
        imports: [database_module_1.DatabaseModule],
        controllers: [
            series_controller_1.SeriesController,
            series_controller_1.OrganizerSeriesController,
            series_staff_controller_1.SeriesInvitationsController,
            series_staff_controller_1.OrganizerSeriesStaffController,
        ],
        providers: [series_repository_1.SeriesRepository, series_service_1.SeriesService],
        exports: [series_repository_1.SeriesRepository, series_service_1.SeriesService],
    })
], SeriesModule);
//# sourceMappingURL=series.module.js.map