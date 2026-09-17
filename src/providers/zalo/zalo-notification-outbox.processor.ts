import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';
import { PG_CONNECTION } from '../../database/database.module';
import type { AppDb } from '../../database/db.types';
import { ZaloBusinessService } from './zalo-business.service';

const RETRY_CAP = 5;
const LEASE_MINUTES = 5;

type ClaimedRow = {
  id: string;
  recipient_user_id: string | null;
  payload: Record<string, string | null>;
  attempts: number;
};

@Injectable()
export class ZaloNotificationOutboxProcessor {
  private readonly logger = new Logger(ZaloNotificationOutboxProcessor.name);
  private readonly instanceId = `${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  private running = false;

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    private readonly zalo: ZaloBusinessService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processOutbox(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let count = 0; count < 20; count += 1) {
        const row = await this.claimOne();
        if (!row) break;
        await this.processClaimed(row);
      }
    } catch (error) {
      this.logger.error(`Zalo outbox cycle failed: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  async dispatchNow(): Promise<void> {
    await this.processOutbox();
  }

  private async claimOne(): Promise<ClaimedRow | null> {
    const rows = (await this.db.execute(sql`
      WITH candidate AS (
        SELECT id
        FROM zalo_notification_outbox
        WHERE (
          (status = 'PENDING' AND next_attempt_at <= now())
          OR (status = 'PROCESSING' AND lease_expires_at < now())
        )
          AND attempts < ${RETRY_CAP}
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE zalo_notification_outbox
      SET status = 'PROCESSING',
          lease_expires_at = now() + interval '${sql.raw(String(LEASE_MINUTES))} minutes',
          attempts = attempts + 1,
          updated_at = now(),
          last_error = NULL,
          last_error_code = NULL
      WHERE id IN (SELECT id FROM candidate)
      RETURNING id, recipient_user_id, payload, attempts
    `)) as unknown as ClaimedRow[];
    return rows[0] ?? null;
  }

  private async processClaimed(row: ClaimedRow): Promise<void> {
    if (!row.recipient_user_id) {
      await this.markBlocked(row.id, 'OWNER_NOT_FOUND');
      return;
    }
    const [profile] = (await this.db.execute(sql`
      SELECT p.phone_number, u.is_phone_verified
      FROM profiles p
      INNER JOIN users u ON u.id = p.user_id
      WHERE p.user_id = ${row.recipient_user_id}
        AND u.deleted_at IS NULL
      LIMIT 1
    `)) as unknown as Array<{ phone_number: string | null; is_phone_verified: boolean }>;
    if (!profile?.phone_number || profile.is_phone_verified !== true) {
      await this.markBlocked(row.id, 'OWNER_PHONE_UNVERIFIED');
      return;
    }
    const templateData = Object.fromEntries(
      Object.entries(row.payload)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, value]) => [key, value.slice(0, 500)]),
    );
    const result = await this.zalo.sendTemplateMessage({
      phone: profile.phone_number,
      templateData,
      trackingId: row.id,
    });
    if (result.ok) {
      await this.db.execute(sql`
        UPDATE zalo_notification_outbox
        SET status = 'SENT', provider_message_id = ${result.messageId},
            lease_expires_at = NULL, updated_at = now()
        WHERE id = ${row.id} AND status = 'PROCESSING'
      `);
      return;
    }
    if (result.retryable && row.attempts < RETRY_CAP) {
      const backoffSeconds = Math.min(2 ** row.attempts, 300);
      await this.db.execute(sql`
        UPDATE zalo_notification_outbox
        SET status = 'PENDING',
            next_attempt_at = now() + interval '${sql.raw(String(backoffSeconds))} seconds',
            lease_expires_at = NULL,
            last_error_code = ${result.code},
            last_error = ${result.code},
            updated_at = now()
        WHERE id = ${row.id} AND status = 'PROCESSING'
      `);
      return;
    }
    if (result.retryable) {
      await this.markFailed(row.id, result.code);
    } else {
      await this.markBlocked(row.id, result.code);
    }
  }

  private async markBlocked(id: string, code: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE zalo_notification_outbox
      SET status = 'BLOCKED', lease_expires_at = NULL,
          last_error_code = ${code}, last_error = ${code}, updated_at = now()
      WHERE id = ${id} AND status = 'PROCESSING'
    `);
  }

  private async markFailed(id: string, code: string): Promise<void> {
    await this.db.execute(sql`
      UPDATE zalo_notification_outbox
      SET status = 'FAILED', lease_expires_at = NULL,
          last_error_code = ${code}, last_error = ${code}, updated_at = now()
      WHERE id = ${id} AND status = 'PROCESSING'
    `);
  }
}
