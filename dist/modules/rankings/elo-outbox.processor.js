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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EloOutboxProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EloOutboxProcessor = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const common_2 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_module_1 = require("../../database/database.module");
const rankings_service_1 = require("./rankings.service");
const RETRY_CAP = 5;
const LEASE_TIMEOUT_MINUTES = 5;
let EloOutboxProcessor = EloOutboxProcessor_1 = class EloOutboxProcessor {
    db;
    rankingsService;
    logger = new common_1.Logger(EloOutboxProcessor_1.name);
    instanceId;
    constructor(db, rankingsService) {
        this.db = db;
        this.rankingsService = rankingsService;
        this.instanceId =
            process.env.HOSTNAME || process.env.POD_NAME || `${require('os').hostname()}-${process.pid}`;
    }
    async processOutbox() {
        let claimed = 0;
        try {
            while (claimed < 20) {
                const row = await this.claimOne();
                if (!row)
                    break;
                claimed += 1;
                await this.processClaimed(row);
            }
        }
        catch (err) {
            this.logger.error(`ELO outbox cycle failed: ${err.message}`, err.stack);
        }
    }
    async claimOne() {
        const result = (await this.db.execute((0, drizzle_orm_1.sql) `
      WITH candidate AS (
        SELECT id FROM match_elo_outbox
        WHERE (
          (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR
          (status = 'PROCESSING' AND locked_at IS NOT NULL
             AND locked_at < now() - interval '${drizzle_orm_1.sql.raw(String(LEASE_TIMEOUT_MINUTES))} minutes')
        )
          AND attempts < ${RETRY_CAP}
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE match_elo_outbox
      SET status = 'PROCESSING',
          locked_at = now(),
          locked_by = ${this.instanceId},
          attempts = attempts + 1,
          last_error = NULL
      WHERE id IN (SELECT id FROM candidate)
      RETURNING id, match_id
    `));
        return result[0] ?? null;
    }
    async processClaimed(row) {
        try {
            await this.rankingsService.processMatchResultFromOutbox(row.match_id);
            await this.db.execute((0, drizzle_orm_1.sql) `
        UPDATE match_elo_outbox
        SET status = 'PROCESSED', processed_at = now(), locked_at = NULL, locked_by = NULL
        WHERE id = ${row.id}
      `);
        }
        catch (err) {
            const message = err.message ?? String(err);
            const attemptsResult = (await this.db.execute((0, drizzle_orm_1.sql) `
        SELECT attempts FROM match_elo_outbox WHERE id = ${row.id}
      `));
            const attempts = attemptsResult[0] ? Number(attemptsResult[0].attempts) : 1;
            if (attempts < RETRY_CAP) {
                const backoffSeconds = Math.min(2 ** attempts, 300);
                await this.db.execute((0, drizzle_orm_1.sql) `
          UPDATE match_elo_outbox
          SET status = 'PENDING',
              next_attempt_at = now() + interval '${drizzle_orm_1.sql.raw(String(backoffSeconds))} seconds',
              locked_at = NULL, locked_by = NULL,
              last_error = ${message}
          WHERE id = ${row.id}
        `);
                this.logger.warn(`ELO outbox retry (attempt ${attempts}/${RETRY_CAP}) for match ${row.match_id}: ${message}`);
            }
            else {
                await this.db.execute((0, drizzle_orm_1.sql) `
          UPDATE match_elo_outbox
          SET status = 'FAILED', locked_at = NULL, locked_by = NULL, last_error = ${message}
          WHERE id = ${row.id}
        `);
                this.logger.error(`ELO outbox FAILED (terminal) for match ${row.match_id}: ${message}`);
            }
        }
    }
};
exports.EloOutboxProcessor = EloOutboxProcessor;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_30_SECONDS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], EloOutboxProcessor.prototype, "processOutbox", null);
exports.EloOutboxProcessor = EloOutboxProcessor = EloOutboxProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_2.Inject)(database_module_1.PG_CONNECTION)),
    __metadata("design:paramtypes", [Object, rankings_service_1.RankingsService])
], EloOutboxProcessor);
//# sourceMappingURL=elo-outbox.processor.js.map