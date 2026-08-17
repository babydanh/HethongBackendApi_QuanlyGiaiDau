"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VenuesService = void 0;
const common_1 = require("@nestjs/common");
const venues_repository_1 = require("./venues.repository");
let VenuesService = class VenuesService {
    venuesRepository;
    constructor(venuesRepository) {
        this.venuesRepository = venuesRepository;
    }
    async findAll(query) {
        return this.venuesRepository.findAll(query);
    }
    async findOne(id) {
        const venue = await this.venuesRepository.findById(id);
        if (!venue) {
            throw new common_1.NotFoundException('Venue not found');
        }
        const courts = await this.venuesRepository.findCourtsByVenue(id);
        return { ...venue, courts };
    }
    async create(userId, createVenueDto) {
        return this.venuesRepository.create(userId, createVenueDto);
    }
    async update(id, userId, updateVenueDto) {
        const existing = await this.venuesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Venue not found');
        return this.venuesRepository.update(id, userId, updateVenueDto);
    }
    async remove(id) {
        const existing = await this.venuesRepository.findById(id);
        if (!existing)
            throw new common_1.NotFoundException('Venue not found');
        return this.venuesRepository.delete(id);
    }
    async addCourt(venueId, createVenueCourtDto) {
        const existing = await this.venuesRepository.findById(venueId);
        if (!existing)
            throw new common_1.NotFoundException('Venue not found');
        return this.venuesRepository.addCourt(venueId, createVenueCourtDto);
    }
    async removeCourt(venueId, courtId) {
        const existing = await this.venuesRepository.findById(venueId);
        if (!existing)
            throw new common_1.NotFoundException('Venue not found');
        const deleted = await this.venuesRepository.removeCourt(courtId);
        if (!deleted)
            throw new common_1.NotFoundException('Court not found');
        return deleted;
    }
};
exports.VenuesService = VenuesService;
exports.VenuesService = VenuesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [venues_repository_1.VenuesRepository])
], VenuesService);
//# sourceMappingURL=venues.service.js.map