"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VenuesRepository = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
const drizzle_orm_1 = require("drizzle-orm");
const audit_service_1 = require("../audit/audit.service");
let VenuesRepository = class VenuesRepository {
    db;
    auditService;
    constructor(db, auditService) {
        this.db = db;
        this.auditService = auditService;
    }
    async findAll(query) {
        const { page = 1, limit = 10, cursor, search } = query;
        let conditions = undefined;
        if (search) {
            conditions = (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema.tournamentVenues.name, `%${search}%`), (0, drizzle_orm_1.ilike)(schema.tournamentVenues.locationAddress, `%${search}%`));
        }
        const baseConditions = (0, drizzle_orm_1.and)(conditions, (0, drizzle_orm_1.sql) `${schema.tournamentVenues.deletedAt} IS NULL`);
        let whereClause = baseConditions;
        let cursorValue = null;
        if (cursor) {
            try {
                cursorValue = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
            }
            catch {
                cursorValue = null;
            }
        }
        if (cursorValue) {
            const cursorDate = new Date(cursorValue.createdAt);
            whereClause = (0, drizzle_orm_1.and)(baseConditions, (0, drizzle_orm_1.sql) `(${schema.tournamentVenues.createdAt} < ${cursorDate} OR (${schema.tournamentVenues.createdAt} = ${cursorDate} AND ${schema.tournamentVenues.id} < ${cursorValue.id}))`);
        }
        const [totalRecord] = await this.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentVenues)
            .where(baseConditions);
        let venuesQuery = this.db
            .select()
            .from(schema.tournamentVenues)
            .where(whereClause)
            .orderBy((0, drizzle_orm_1.desc)(schema.tournamentVenues.createdAt), (0, drizzle_orm_1.desc)(schema.tournamentVenues.id))
            .limit(limit + 1)
            .$dynamic();
        const rows = await venuesQuery;
        const hasMore = rows.length > limit;
        const venues = (hasMore ? rows.slice(0, limit) : rows);
        const lastVenue = venues.at(-1);
        const nextCursor = hasMore && lastVenue
            ? Buffer.from(JSON.stringify({ createdAt: lastVenue.createdAt.toISOString(), id: lastVenue.id })).toString('base64url')
            : null;
        return {
            data: venues,
            meta: {
                total: totalRecord.count,
                page,
                limit,
                totalPages: Math.ceil(totalRecord.count / limit),
                nextCursor,
                hasMore,
            },
        };
    }
    async findById(id) {
        const result = await this.db
            .select()
            .from(schema.tournamentVenues)
            .where((0, drizzle_orm_1.eq)(schema.tournamentVenues.id, id))
            .limit(1);
        if (result.length === 0)
            return null;
        return result[0];
    }
    async create(userId, data) {
        let geographyValue = null;
        if (data.longitude && data.latitude) {
            geographyValue = (0, drizzle_orm_1.sql) `ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`;
        }
        return await this.db.transaction(async (tx) => {
            const [record] = await tx
                .insert(schema.tournamentVenues)
                .values({
                name: data.name,
                locationAddress: data.locationAddress,
                ...(geographyValue !== null && { locationGeolocation: geographyValue }),
                imagesUrls: data.imagesUrls,
            })
                .returning();
            await this.auditService.logCreate(tx, userId, 'tournament_venues', record.id, record);
            return record;
        });
    }
    async update(id, userId, data) {
        let geographyValue = undefined;
        if (data.longitude && data.latitude) {
            geographyValue = (0, drizzle_orm_1.sql) `ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326)`;
        }
        return await this.db.transaction(async (tx) => {
            const [oldRecord] = await tx.select().from(schema.tournamentVenues).where((0, drizzle_orm_1.eq)(schema.tournamentVenues.id, id)).limit(1);
            const [updated] = await tx
                .update(schema.tournamentVenues)
                .set({
                ...(data.name && { name: data.name }),
                ...(data.locationAddress && { locationAddress: data.locationAddress }),
                ...(geographyValue !== undefined && { locationGeolocation: geographyValue }),
                ...(data.imagesUrls && { imagesUrls: data.imagesUrls }),
            })
                .where((0, drizzle_orm_1.eq)(schema.tournamentVenues.id, id))
                .returning();
            await this.auditService.logUpdate(tx, userId, 'tournament_venues', id, oldRecord, updated);
            return updated;
        });
    }
    async delete(id) {
        const [deleted] = await this.db
            .delete(schema.tournamentVenues)
            .where((0, drizzle_orm_1.eq)(schema.tournamentVenues.id, id))
            .returning();
        return deleted;
    }
    async findCourtsByVenue(venueId) {
        return this.db
            .select()
            .from(schema.venueCourts)
            .where((0, drizzle_orm_1.eq)(schema.venueCourts.venueId, venueId));
    }
    async addCourt(venueId, data) {
        const [court] = await this.db
            .insert(schema.venueCourts)
            .values({
            venueId,
            courtName: data.courtName,
            status: data.status || 'AVAILABLE',
        })
            .returning();
        return court;
    }
    async removeCourt(courtId) {
        const [deleted] = await this.db
            .delete(schema.venueCourts)
            .where((0, drizzle_orm_1.eq)(schema.venueCourts.id, courtId))
            .returning();
        return deleted;
    }
};
exports.VenuesRepository = VenuesRepository;
exports.VenuesRepository = VenuesRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, audit_service_1.AuditService])
], VenuesRepository);
//# sourceMappingURL=venues.repository.js.map