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
Object.defineProperty(exports, "__esModule", { value: true });
const postgres_js_1 = require("drizzle-orm/postgres-js");
const dotenv = __importStar(require("dotenv"));
const drizzle_orm_1 = require("drizzle-orm");
const postgres_client_1 = require("../postgres-client");
dotenv.config();
async function clearTournaments() {
    console.log('⚠️ Bắt đầu xoá tất cả giải đấu...');
    const client = (0, postgres_client_1.createPostgresClientFromEnv)();
    const db = (0, postgres_js_1.drizzle)(client);
    try {
        await db.execute((0, drizzle_orm_1.sql) `TRUNCATE TABLE tournaments, parent_tournaments, matches, tournament_participants, tournament_stages, tournament_groups, tournament_divisions, livestream_cameras, payments, payment_status_logs, tournament_series, series_legs, series_events, series_standings, psr_point_logs, series_invitations, series_managers, advertisements CASCADE;`);
        console.log('✅ Đã xoá thành công toàn bộ giải đấu và dữ liệu liên quan trên Database!');
    }
    catch (error) {
        console.error('❌ Lỗi khi xoá giải đấu:', error);
    }
    finally {
        await client.end();
    }
}
clearTournaments().catch(console.error);
//# sourceMappingURL=clear-tournaments.js.map