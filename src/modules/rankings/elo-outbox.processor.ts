import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import { RankingsService } from './rankings.service';

const RETRY_CAP = 5;
const LEASE_TIMEOUT_MINUTES = 5;

/**
 * ELO transactional outbox worker (NOTE-3, T13).
 *
 * Claims PENDING rows (or PROCESSING rows with an expired lease) via an atomic
 * CTE `UPDATE ... FROM candidate ... FOR UPDATE SKIP LOCKED` — safe for
 * multiple backend instances. State machine (schema `match_elo_outbox`):
 *   PENDING(retryable) → PROCESSING(lease) → PROCESSED(ok) | FAILED(terminal)
 *   retryable failure returns to PENDING with exponential backoff.
 *
 * Idempotency is already guaranteed by RankingsService.processMatchResult
 * (pg_advisory_xact_lock + unique elo_history_logs index + alreadyProcessed
 * check), so a crash after ELO success but before marking PROCESSED cannot
 * double-count.
 */
@Injectable()
export class EloOutboxProcessor {
  private readonly logger = new Logger(EloOutboxProcessor.name);
  private readonly instanceId: string;

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly rankingsService: RankingsService,
  ) {
    this.instanceId =
      process.env.HOSTNAME || process.env.POD_NAME || `${require('os').hostname()}-${process.pid}`;
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processOutbox(): Promise<void> {
    let claimed = 0;
    try {
      while (claimed < 20) {
        const row = await this.claimOne();
        if (!row) break;
        claimed += 1;
        await this.processClaimed(row);
      }
    } catch (err) {
      this.logger.error(`ELO outbox cycle failed: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  private async claimOne(): Promise<
    | { id: string; match_id: string }
    | null
  > {
    const result = (await this.db.execute(sql`
      WITH candidate AS (
        SELECT id FROM match_elo_outbox
        WHERE (
          (status = 'PENDING' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
          OR
          (status = 'PROCESSING' AND locked_at IS NOT NULL
             AND locked_at < now() - interval '${sql.raw(String(LEASE_TIMEOUT_MINUTES))} minutes')
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
    `)) as unknown as Array<{ id: string; match_id: string }>;

    return result[0] ?? null;
  }

  private async processClaimed(row: { id: string; match_id: string }): Promise<void> {
    try {
      await this.rankingsService.processMatchResultFromOutbox(row.match_id);
      await this.db.execute(sql`
        UPDATE match_elo_outbox
        SET status = 'PROCESSED', processed_at = now(), locked_at = NULL, locked_by = NULL
        WHERE id = ${row.id}
      `);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // Retryable (transient) + under cap → back to PENDING with backoff.
      const attemptsResult = (await this.db.execute(sql`
        SELECT attempts FROM match_elo_outbox WHERE id = ${row.id}
      `)) as unknown as Array<{ attempts: string }>;
      const attempts = attemptsResult[0] ? Number(attemptsResult[0].attempts) : 1;

      if (attempts < RETRY_CAP) {
        const backoffSeconds = Math.min(2 ** attempts, 300);
        await this.db.execute(sql`
          UPDATE match_elo_outbox
          SET status = 'PENDING',
              next_attempt_at = now() + interval '${sql.raw(String(backoffSeconds))} seconds',
              locked_at = NULL, locked_by = NULL,
              last_error = ${message}
          WHERE id = ${row.id}
        `);
        this.logger.warn(`ELO outbox retry (attempt ${attempts}/${RETRY_CAP}) for match ${row.match_id}: ${message}`);
      } else {
        // Terminal failure after retry cap.
        await this.db.execute(sql`
          UPDATE match_elo_outbox
          SET status = 'FAILED', locked_at = NULL, locked_by = NULL, last_error = ${message}
          WHERE id = ${row.id}
        `);
        this.logger.error(`ELO outbox FAILED (terminal) for match ${row.match_id}: ${message}`);
      }
    }
  }
}
