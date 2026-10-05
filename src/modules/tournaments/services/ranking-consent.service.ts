import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { PG_CONNECTION } from '../../../database/database.module';
import type { AppDb } from '../../../database/db.types';
import * as schema from '../../../database/schema';
import { MailService } from '../../../providers/mail/mail.service';

/**
 * Thông báo XÁC NHẬN (không phải lời mời) cho người tham gia.
 *
 * Mail KHÔNG mang token: bấm xác nhận phải đi qua endpoint đã đăng nhập, nên không
 * có bí mật nào nằm trong link để lộ. Link chỉ đưa người chơi tới trang giải để bấm.
 *
 * Tự động nhắc tối đa 3 lần rồi dừng — bấm tay từ phía ban tổ chức là thao tác
 * không còn thiết.
 */
export const CONSENT_MAX_NOTIFICATIONS = 3;

/** Số giờ chờ trước mỗi lần nhắc, tính từ lần gửi gần nhất. */
export const CONSENT_REMINDER_DELAYS_HOURS = [24, 72] as const;

@Injectable()
export class RankingConsentService {
  private readonly logger = new Logger(RankingConsentService.name);

  constructor(
    @Inject(PG_CONNECTION) private readonly db: AppDb,
    @Optional() private readonly mailService?: MailService,
  ) {}

  private get frontendUrl(): string {
    return (
      process.env.FRONTEND_URL?.replace(/\/$/, '') ?? 'http://localhost:3001'
    );
  }

  /** Gửi ngay cho một roster row cụ thể (dùng khi vừa thêm người). */
  async sendConfirmationRequest(rosterId: string): Promise<boolean> {
    return this.dispatch(rosterId, 'Xác nhận tham gia giải đấu');
  }

  /** Nhắc lại cho những ai đã quá hạn mà chưa xác nhận. */
  async sendDueReminders(): Promise<number> {
    const now = Date.now();

    // Rows whose notifiedAt is still NULL are included on purpose. dispatch stamps
    // that column only after a successful send, so filtering NULLs out would mean a
    // single temporary mail outage silently ends all reminders — the player never
    // hears again and never learns their matches go unscored. That is exactly the
    // silent-exclusion failure this feature exists to prevent.
    const due = await this.db
      .select({
        id: schema.tournamentRosters.id,
        attempts: schema.tournamentRosters.consentNotifiedCount,
        notifiedAt: schema.tournamentRosters.consentNotifiedAt,
        joinedAt: schema.tournamentRosters.joinedAt,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.tournamentParticipants,
        eq(
          schema.tournamentParticipants.id,
          schema.tournamentRosters.participantId,
        ),
      )
      .innerJoin(
        schema.tournaments,
        eq(schema.tournaments.id, schema.tournamentParticipants.tournamentId),
      )
      .where(
        and(
          isNull(schema.tournamentRosters.rankingConsentAt),
          // A tournament that does not rank scores nothing, so asking its players to
          // consent would be noise.
          eq(schema.tournaments.isRanked, true),
        ),
      );

    let sent = 0;
    for (const row of due) {
      // Three sends in total: the one at add time plus two reminders. Past the cap
      // the row is left alone — nobody gets nagged forever.
      if (row.attempts >= CONSENT_MAX_NOTIFICATIONS) continue;

      // attempts === 0 means the first send never landed, so the clock runs from
      // when the player joined instead of from a send that does not exist.
      const anchor = row.notifiedAt ?? row.joinedAt;
      if (!anchor) continue;

      // attempts counts DELIVERED sends, and the send at add time already made it 1.
      // So the first reminder is attempts === 1 → delays[0] = 24h. Indexing by
      // `attempts` would jump straight to 72h and leave delays[0] as dead code.
      // attempts === 0 means nothing was delivered yet, so the 24h delay runs from
      // joinedAt instead.
      const delayHours =
        CONSENT_REMINDER_DELAYS_HOURS[
          Math.min(
            Math.max(row.attempts - 1, 0),
            CONSENT_REMINDER_DELAYS_HOURS.length - 1,
          )
        ];
      const elapsedHours = (now - new Date(anchor).getTime()) / 3_600_000;
      if (elapsedHours < delayHours) continue;

      if (await this.dispatch(row.id, 'Nhắc xác nhận tham gia giải đấu')) {
        sent += 1;
      }
    }
    return sent;
  }

  /**
   * Gửi 1 mail và ghi nhận số lần đã gửi.
   *
   * Chỉ tăng bộ đếm khi gửi THÀNH CÔNG — nếu không, một hệ thống mail hỏng sẽ đốt
   * hết 3 lượt nhắc rồi im lặng, biến "chưa gửi được" thành "đã bỏ qua".
   */
  private async dispatch(rosterId: string, subject: string): Promise<boolean> {
    if (!this.mailService) return false;

    const rows = await this.db
      .select({
        userEmail: schema.users.email,
        participantName: schema.tournamentParticipants.teamName,
        tournamentName: schema.tournaments.name,
        tournamentId: schema.tournaments.id,
        attempts: schema.tournamentRosters.consentNotifiedCount,
        consentedAt: schema.tournamentRosters.rankingConsentAt,
      })
      .from(schema.tournamentRosters)
      .innerJoin(
        schema.users,
        eq(schema.users.id, schema.tournamentRosters.userId),
      )
      .innerJoin(
        schema.tournamentParticipants,
        eq(schema.tournamentParticipants.id, schema.tournamentRosters.participantId),
      )
      .innerJoin(
        schema.tournaments,
        eq(schema.tournaments.id, schema.tournamentParticipants.tournamentId),
      )
      .where(eq(schema.tournamentRosters.id, rosterId))
      .limit(1);

    const row = rows[0];
    if (!row?.userEmail || row.consentedAt) return false;

    const link = `${this.frontendUrl}/tournaments/${row.tournamentId}`;
    const isReminder = row.attempts > 0;

    try {
      const ok = await this.mailService.sendMail(
        row.userEmail,
        `[Sporto] ${subject}: ${row.tournamentName}`,
        this.buildHtml({
          participantName: row.participantName,
          tournamentName: row.tournamentName,
          link,
          isReminder,
        }),
      );
      if (!ok) return false;
    } catch (err) {
      this.logger.warn(
        `Gửi mail xác nhận thất bại cho roster ${rosterId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }

    await this.db
      .update(schema.tournamentRosters)
      .set({
        consentNotifiedAt: new Date(),
        consentNotifiedCount: row.attempts + 1,
      })
      .where(eq(schema.tournamentRosters.id, rosterId));

    return true;
  }

  private buildHtml(args: {
    participantName: string | null;
    tournamentName: string;
    link: string;
    isReminder: boolean;
  }): string {
    const heading = args.isReminder
      ? 'Bạn chưa xác nhận tham gia'
      : 'Bạn được thêm vào một giải đấu';
    return `
      <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px;">
        <div style="background-color: #0f172a; padding: 20px; border-radius: 8px 8px 0 0;">
          <h1 style="color: #ffffff; font-size: 18px; margin: 0;">${heading}</h1>
        </div>
        <div style="background-color: #ffffff; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
          <p style="font-size: 14px; color: #0f172a; margin: 0 0 16px;">
            Xin chào ${args.participantName ?? 'bạn'},
          </p>
          <p style="font-size: 14px; color: #334155; margin: 0 0 16px;">
            Ban tổ chức đã thêm bạn vào giải
            <strong>${args.tournamentName}</strong>.
          </p>
          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; margin-bottom: 20px;">
            <p style="font-size: 14px; color: #78350f; margin: 0;">
              Muốn được tính Elo và lưu lịch sử trận đấu, bạn cần bấm xác nhận.
              <br />
              Chỉ những trận <strong>hoàn thành từ lúc bạn xác nhận</strong> mới được
              tính — các trận đã đấu trước đó không tính.
            </p>
          </div>
          <a href="${args.link}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">
            Đăng nhập để xác nhận
          </a>
          <p style="font-size: 13px; color: #64748b; margin: 20px 0 0;">
            Không xác nhận? Bạn vẫn thi đấu bình thường, chỉ là không có Elo.
          </p>
        </div>
      </div>
    `;
  }
}
