import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  integer,
  boolean,
  jsonb,
  text,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tournaments } from './tournaments.schema';
import { tournamentVenues } from './venues.schema';

/**
 * Hạng mục (nội dung thi đấu) của một giải, ví dụ đơn, đôi, đôi nam nữ. Có thể ghi đè phí, sơ đồ thi đấu và khoảng ELO so với giải. Xóa giải sẽ xóa các hạng mục (onDelete cascade).
 */
export const tournamentDivisions = pgTable(
  'tournament_divisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tournamentId: uuid('tournament_id')
      .references(() => tournaments.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    /**
     * Loại thi đấu của hạng mục: SINGLES, DOUBLES hoặc MIXED_DOUBLES (create-division.dto.ts:23-27).
     */
    matchType: varchar('match_type', { length: 50 }).notNull(),
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    maxParticipants: integer('max_participants'),
    // NULL means "inherit the tournament fee". A zero value is a deliberate
    // per-division free override and is therefore kept distinct from NULL.
    /**
     * Phí riêng của hạng mục. NULL = dùng phí của giải; 0 = miễn phí. Chỉ có hiệu lực khi entryFeeOverrideEnabled = true (tournament-payment.repository.ts:95-128).
     */
    entryFee: numeric('entry_fee', { precision: 12, scale: 2 }),
    /**
     * Bật ghi đè phí của hạng mục. Khi false thì entryFee phải NULL; khi true thì entryFee phải có giá trị không âm (CHECK entry_fee_override_consistent).
     */
    entryFeeOverrideEnabled: boolean('entry_fee_override_enabled')
      .default(false)
      .notNull(),
    isConfigOverride: boolean('is_config_override').default(false).notNull(),
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    /**
     * Sơ đồ thi đấu: SINGLE_ELIMINATION, DOUBLE_ELIMINATION hoặc ROUND_ROBIN (create-division.dto.ts:29-33).
     */
    bracketType: varchar('bracket_type', { length: 50 }),
    roundConfig: jsonb('round_config'),
    startDate: timestamp('start_date', { withTimezone: true }),
    registrationEndDate: timestamp('registration_end_date', {
      withTimezone: true,
    }),
  // Khoá đăng ký riêng cho nội dung này. NOT NULL DEFAULT false nên các bản
  // ghi cũ không cần backfill. Cờ khoá cấp giải vẫn mạnh hơn: khoá cả giải thì
  // mọi nội dung đều bị coi là đã khoá.
  /**
   * Khóa đăng ký riêng cho hạng mục. Cờ khóa cấp giải (tournaments.isRegistrationLocked) vẫn mạnh hơn.
   */
  isRegistrationLocked: boolean('is_registration_locked')
    .default(false)
    .notNull(),
    /**
     * Khoảng ELO cho phép của hạng mục (minElo, maxElo). Để trống (null) = không giới hạn. Kiểm tra khi đăng ký (tournament-registration.service.ts, EloCapViolationException).
     */
    minElo: integer('min_elo'),
    maxElo: integer('max_elo'),
    prizeDescription: text('prize_description'),
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    entryFeeOverrideConsistent: check(
      'entry_fee_override_consistent',
      sql`(${table.entryFeeOverrideEnabled} = false AND ${table.entryFee} IS NULL) OR (${table.entryFeeOverrideEnabled} = true AND ${table.entryFee} IS NOT NULL AND ${table.entryFee} >= 0)`,
    ),
  }),
);
