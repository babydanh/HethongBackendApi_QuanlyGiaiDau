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
exports.LivestreamRepository = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const schema = __importStar(require("../../database/schema"));
let LivestreamRepository = class LivestreamRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async findTournamentById(tournamentId) {
        const [tournament] = await this.db
            .select({
            id: schema.tournaments.id,
            name: schema.tournaments.name,
            createdBy: schema.tournaments.createdBy,
        })
            .from(schema.tournaments)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournaments.id, tournamentId), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
            .limit(1);
        return tournament ?? null;
    }
    async isTournamentStaff(tournamentId, userId) {
        const [result] = await this.db
            .select({ total: (0, drizzle_orm_1.count)() })
            .from(schema.tournamentStaff)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.tournamentStaff.tournamentId, tournamentId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.userId, userId), (0, drizzle_orm_1.eq)(schema.tournamentStaff.role, 'CO_ORGANIZER')));
        return Number(result?.total ?? 0) > 0;
    }
    async listCameras(tournamentId) {
        return this.db
            .select()
            .from(schema.livestreamCameras)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.livestreamCameras.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.livestreamCameras.deletedAt)));
    }
    async createCamera(input) {
        const [camera] = await this.db
            .insert(schema.livestreamCameras)
            .values(input)
            .returning();
        return camera;
    }
    async findCameraById(cameraId) {
        const [camera] = await this.db
            .select()
            .from(schema.livestreamCameras)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.livestreamCameras.id, cameraId), (0, drizzle_orm_1.isNull)(schema.livestreamCameras.deletedAt)))
            .limit(1);
        return camera ?? null;
    }
    async deleteCamera(cameraId) {
        await this.db
            .update(schema.matchLivestreams)
            .set({
            cameraId: null,
            streamStatus: 'IDLE',
            playbackUrl: null,
            endedAt: null,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.matchLivestreams.cameraId, cameraId));
        const [camera] = await this.db
            .update(schema.livestreamCameras)
            .set({
            status: 'ARCHIVED',
            deletedAt: new Date(),
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema.livestreamCameras.id, cameraId))
            .returning();
        return camera ?? null;
    }
    async findMatchWithTournament(matchId) {
        const [row] = await this.db
            .select({
            id: schema.matches.id,
            tournamentId: schema.matches.tournamentId,
            status: schema.matches.status,
            refereeId: schema.matches.refereeId,
            participant1Id: schema.matches.participant1Id,
            participant2Id: schema.matches.participant2Id,
            tournamentCreatedBy: schema.tournaments.createdBy,
            tournamentName: schema.tournaments.name,
            tournamentStatus: schema.tournaments.status,
            tournamentVisibility: schema.tournaments.visibility,
        })
            .from(schema.matches)
            .innerJoin(schema.tournaments, (0, drizzle_orm_1.eq)(schema.matches.tournamentId, schema.tournaments.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.id, matchId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt), (0, drizzle_orm_1.isNull)(schema.tournaments.deletedAt)))
            .limit(1);
        return row ?? null;
    }
    async findMatchLivestream(matchId) {
        const [row] = await this.db
            .select({
            id: schema.matchLivestreams.id,
            matchId: schema.matchLivestreams.matchId,
            cameraId: schema.livestreamCameras.id,
            streamStatus: schema.matchLivestreams.streamStatus,
            playbackUrl: schema.matchLivestreams.playbackUrl,
            recordingUrl: schema.matchLivestreams.recordingUrl,
            isFeatured: schema.matchLivestreams.isFeatured,
            startedAt: schema.matchLivestreams.startedAt,
            endedAt: schema.matchLivestreams.endedAt,
            cameraName: schema.livestreamCameras.name,
            cameraStatus: schema.livestreamCameras.status,
            cameraPlaybackUrl: schema.livestreamCameras.playbackUrl,
            cameraProtocol: schema.livestreamCameras.protocol,
            streamName: schema.livestreamCameras.streamName,
            streamKey: schema.livestreamCameras.streamKey,
        })
            .from(schema.matchLivestreams)
            .leftJoin(schema.livestreamCameras, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matchLivestreams.cameraId, schema.livestreamCameras.id), (0, drizzle_orm_1.isNull)(schema.livestreamCameras.deletedAt)))
            .where((0, drizzle_orm_1.eq)(schema.matchLivestreams.matchId, matchId))
            .limit(1);
        return row ?? null;
    }
    async listMatchLivestreams(tournamentId) {
        return this.db
            .select({
            id: schema.matchLivestreams.id,
            matchId: schema.matchLivestreams.matchId,
            cameraId: schema.livestreamCameras.id,
            streamStatus: schema.matchLivestreams.streamStatus,
            playbackUrl: schema.matchLivestreams.playbackUrl,
            recordingUrl: schema.matchLivestreams.recordingUrl,
            isFeatured: schema.matchLivestreams.isFeatured,
            startedAt: schema.matchLivestreams.startedAt,
            endedAt: schema.matchLivestreams.endedAt,
            cameraName: schema.livestreamCameras.name,
        })
            .from(schema.matchLivestreams)
            .innerJoin(schema.matches, (0, drizzle_orm_1.eq)(schema.matchLivestreams.matchId, schema.matches.id))
            .leftJoin(schema.livestreamCameras, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matchLivestreams.cameraId, schema.livestreamCameras.id), (0, drizzle_orm_1.isNull)(schema.livestreamCameras.deletedAt)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matches.tournamentId, tournamentId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
    }
    async assignCameraToMatch(matchId, cameraId, playbackUrl) {
        const [existing] = await this.db
            .select({ cameraId: schema.matchLivestreams.cameraId })
            .from(schema.matchLivestreams)
            .where((0, drizzle_orm_1.eq)(schema.matchLivestreams.matchId, matchId))
            .limit(1);
        const [stream] = await this.db
            .insert(schema.matchLivestreams)
            .values({
            matchId,
            cameraId,
            playbackUrl,
            streamStatus: 'IDLE',
            updatedAt: new Date(),
        })
            .onConflictDoUpdate({
            target: schema.matchLivestreams.matchId,
            set: {
                cameraId,
                playbackUrl,
                streamStatus: 'IDLE',
                startedAt: null,
                endedAt: null,
                updatedAt: new Date(),
            },
        })
            .returning();
        await this.syncCameraStatus(cameraId);
        if (existing?.cameraId && existing.cameraId !== cameraId) {
            await this.syncCameraStatus(existing.cameraId);
        }
        return stream;
    }
    async updateStreamStatus(matchId, status, _userId, playbackUrl) {
        const setValues = status === 'LIVE'
            ? {
                streamStatus: status,
                playbackUrl,
                startedAt: new Date(),
                endedAt: null,
                updatedAt: new Date(),
            }
            : {
                streamStatus: status,
                playbackUrl: null,
                startedAt: null,
                endedAt: null,
                updatedAt: new Date(),
            };
        const [stream] = await this.db
            .update(schema.matchLivestreams)
            .set(setValues)
            .where((0, drizzle_orm_1.eq)(schema.matchLivestreams.matchId, matchId))
            .returning();
        if (stream?.cameraId) {
            await this.syncCameraStatus(stream.cameraId);
        }
        return stream ?? null;
    }
    async syncCameraStatus(cameraId) {
        const assignments = await this.db
            .select({ streamStatus: schema.matchLivestreams.streamStatus })
            .from(schema.matchLivestreams)
            .innerJoin(schema.matches, (0, drizzle_orm_1.eq)(schema.matchLivestreams.matchId, schema.matches.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.matchLivestreams.cameraId, cameraId), (0, drizzle_orm_1.isNull)(schema.matches.deletedAt)));
        const status = assignments.some((item) => item.streamStatus === 'LIVE')
            ? 'LIVE'
            : assignments.length > 0
                ? 'ASSIGNED'
                : 'IDLE';
        await this.db
            .update(schema.livestreamCameras)
            .set({ status, updatedAt: new Date() })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema.livestreamCameras.id, cameraId), (0, drizzle_orm_1.isNull)(schema.livestreamCameras.deletedAt)));
    }
};
exports.LivestreamRepository = LivestreamRepository;
exports.LivestreamRepository = LivestreamRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object])
], LivestreamRepository);
//# sourceMappingURL=livestream.repository.js.map