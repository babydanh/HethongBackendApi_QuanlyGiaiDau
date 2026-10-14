import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  numeric,
  boolean,
  timestamp,
  integer,
  check,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.schema';
import { communities } from './communities.schema';
import { categories } from './categories.schema';
import { tournamentVenues } from './venues.schema';
import { tournamentDivisions } from './tournament_divisions.schema';

export const parentTournaments = pgTable('parent_tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  bannerUrl: text('banner_url'),
  logoUrl: text('logo_url'),
  sports: jsonb('sports').$type<string[]>().default([]).notNull(),
  createdBy: uuid('created_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

/**
 * Giải đấu do người tổ chức tạo. Là gốc của hạng mục (tournament_divisions), đăng ký (tournament_participants), vòng đấu (tournament_stages), nhân sự, trọng tài và lượt theo dõi.
 * Có thể thuộc một parent_tournaments và một community.
 */
export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id').references(() => parentTournaments.id, {
      onDelete: 'cascade',
    }),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    categoryId: uuid('category_id')
      .references(() => categories.id)
      .notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    /**
     * Trạng thái vòng đời. Giá trị (update-tournament.dto.ts:12-17): DRAFT, UPCOMING, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED. Admin/hệ thống còn đặt PENDING_APPROVAL, PENDING_DELETE, SUSPENDED (admin.service.ts).
     * Publish: PENDING_APPROVAL (người không phải admin, visibility PUBLIC), còn lại UPCOMING hoặc REGISTRATION_OPEN. Đóng đăng ký: REGISTRATION_CLOSED, riêng CLUB hoặc phí = 0 thì UPCOMING (tournament-lifecycle.service.ts, methods publish và lock).
     */
    status: varchar('status', { length: 50 }).default('DRAFT').notNull(),
    /**
     * Loại thi đấu của giải: SINGLES hoặc DOUBLES, mặc định DOUBLES (MatchType, common/constants/enums.ts:55-58). Hạng mục còn có MIXED_DOUBLES (create-division.dto.ts).
     */
    matchType: varchar('match_type', { length: 50 }).default('DOUBLES').notNull(),
    sportRules: jsonb('sport_rules').notNull(),
    tournamentConfig: jsonb('tournament_config').notNull(),
    /**
     * Phí đăng ký mặc định của giải. Hạng mục có phí riêng sẽ ghi đè khi entryFeeOverrideEnabled = true và đăng ký chưa có snapshot (payments.service.ts:582-591). Đơn vị tiền tệ không khai báo trong code.
     */
    entryFee: numeric('entry_fee', { precision: 12, scale: 2 })
      .default('0.00')
      .notNull(),
    /**
     * Snapshot % phí nền tảng (0–100), chụp lúc tạo giải từ cấu hình PLATFORM_FEE_PERCENTAGE_* theo loại giải. DTO có thể ghi đè. Thanh toán đọc snapshot này, không đọc cấu hình chung (tournament-catalog.repository.ts:1100-1165, payments.service.ts:694-696).
     */
    platformFeePercentage: numeric('platform_fee_percentage', {
      precision: 5,
      scale: 2,
    })
      .default('5.00')
      .notNull(),
    /**
     * Snapshot ngưỡng phí. entryFee ≥ ngưỡng thì phí = entryFee × platformFeePercentage / 100 (làm tròn); dưới ngưỡng dùng platformFeeFixedAmount (common/helpers/platform-fee.helper.ts:23-43).
     */
    platformFeeThreshold: numeric('platform_fee_threshold', {
      precision: 12,
      scale: 2,
    })
      .default('100000.00')
      .notNull(),
    /**
     * Snapshot phí cố định áp dụng khi entryFee nhỏ hơn platformFeeThreshold. Nhân với số VĐV trong đăng ký (payments.service.ts:611-623).
     */
    platformFeeFixedAmount: numeric('platform_fee_fixed_amount', {
      precision: 12,
      scale: 2,
    })
      .default('5000.00')
      .notNull(),
    registrationStartDate: timestamp('registration_start_date', { withTimezone: true }),
    registrationEndDate: timestamp('registration_end_date', { withTimezone: true }),
    maxParticipants: integer('max_participants'),
    startDate: timestamp('start_date', { withTimezone: true }),
    /**
     * Ngày kết thúc. Khi đã qua, scheduler chuyển giải sang COMPLETED nếu đang ở REGISTRATION_OPEN, REGISTRATION_CLOSED, UPCOMING hoặc IN_PROGRESS (tournament-scheduler.service.ts:100-110).
     */
    endDate: timestamp('end_date', { withTimezone: true }),
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    /**
     * Loại giải: CLUB hoặc PUBLIC (create-tournament.dto.ts:26-27). CLUB dùng khóa cấu hình phí CLUB và khi đóng đăng ký chuyển thẳng sang UPCOMING.
     */
    tournamentType: varchar('tournament_type', { length: 50 }).default('CLUB').notNull(),
    bannerUrl: text('banner_url'),
    logoUrl: text('logo_url'),
    galleryImages: text('gallery_images')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    prizeDescription: text('prize_description'),
    prizes: jsonb('prizes').default(sql`'[]'::jsonb`),
    inviteCode: varchar('invite_code', { length: 20 }).unique(),
    /**
     * Phạm vi hiển thị, mặc định PUBLIC. Với PUBLIC, người không phải admin khi publish sẽ chuyển sang PENDING_APPROVAL để admin duyệt (tournament-lifecycle.service.ts, method publish).
     */
    visibility: varchar('visibility', { length: 50 }).default('PUBLIC').notNull(),
    /**
     * Giới hạn giới tính: ANY, MALE, FEMALE, MIXED (GenderRestriction, common/constants/enums.ts:60-65).
     */
    genderRestriction: varchar('gender_restriction', { length: 20 }),
    contactInfo: jsonb('contact_info'),
    city: varchar('city', { length: 100 }),
    reservedSlotsCount: integer('reserved_slots_count').default(0).notNull(),
    /**
     * Giải có tính ELO hay không, mặc định true. Bị khóa sau khi publish (tournament-lifecycle.service.ts:666-669). Admin cập nhật ELO thủ công cho trận của giải không ranked sẽ bị từ chối (rankings.service.ts:305-307).
     */
    isRanked: boolean('is_ranked').default(true).notNull(),
    /**
     * Khóa đăng ký ở cấp giải. Mạnh hơn isRegistrationLocked của hạng mục. Được đặt true khi đóng đăng ký (tournament-lifecycle.service.ts, method lock).
     */
    isRegistrationLocked: boolean('is_registration_locked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Completed tournaments are archived instead of being hidden by soft-delete.
    /**
     * Thời điểm lưu trữ giải, ghi bởi tournament-catalog.repository.ts:1553.
     */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    entryFeeNonNegative: check(
      'entry_fee_non_negative',
      sql`${table.entryFee} >= 0`,
    ),
    platformFeeValid: check(
      'platform_fee_valid',
      sql`${table.platformFeePercentage} >= 0 AND ${table.platformFeePercentage} <= 100`,
    ),
    platformFeeThresholdValid: check(
      'platform_fee_threshold_valid',
      sql`${table.platformFeeThreshold} >= 0`,
    ),
    platformFeeFixedAmountValid: check(
      'platform_fee_fixed_amount_valid',
      sql`${table.platformFeeFixedAmount} >= 0`,
    ),
    idxTournamentsStatusVisibility: index('idx_tournaments_status_visibility').on(
      table.status,
      table.visibility,
    ),
    idxTournamentsCreatedBy: index('idx_tournaments_created_by').on(
      table.createdBy,
    ),
  }),
);

/**
 * Vòng thi đấu của giải, hoặc của một hạng mục khi tournamentDivisionId có giá trị. Thứ tự hiển thị theo cột order.
 */
export const tournamentStages = pgTable('tournament_stages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  tournamentDivisionId: uuid('tournament_division_id').references(
    () => tournamentDivisions.id,
    { onDelete: 'cascade' },
  ),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  order: integer('order').notNull(),
  roundConfig: jsonb('round_config'),
  venueId: uuid('venue_id').references(() => tournamentVenues.id, { onDelete: 'set null' }),
  scheduledDate: date('scheduled_date'),
  notificationNote: text('notification_note'),
  matchSettings: jsonb('match_settings'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  idxStagesTournamentDivision: index('idx_stages_tournament_division').on(
    table.tournamentId,
    table.tournamentDivisionId,
  ),
}));

/**
 * Bảng (nhóm) thi đấu thuộc một vòng (tournament_stages). Không có FK trực tiếp tới giải; truy cập giải qua stageId.
 */
export const tournamentGroups = pgTable('tournament_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  stageId: uuid('stage_id')
    .references(() => tournamentStages.id, { onDelete: 'cascade' })
    .notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  roundConfig: jsonb('round_config'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => ({
  idxGroupsStageId: index('idx_groups_stage_id').on(table.stageId),
}));

/**
 * Đăng ký tham gia một hạng mục của giải: một đội, một cặp đôi hoặc một VĐV đơn. Trạng thái xử lý nằm ở teamStatus; người chơi thực tế nằm ở tournament_rosters.
 */
export const tournamentParticipants = pgTable('tournament_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  tournamentDivisionId: uuid('tournament_division_id').references(
    () => tournamentDivisions.id,
    { onDelete: 'cascade' },
  ),
  groupId: uuid('group_id').references(() => tournamentGroups.id, {
    onDelete: 'set null',
  }),
  registeredBy: uuid('registered_by')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  teamName: varchar('team_name', { length: 255 }).notNull(),
  // FK is applied by the standalone migration to avoid a runtime schema import cycle.
  footballTeamId: uuid('football_team_id'),
  footballTeamLogoUrl: varchar('football_team_logo_url', { length: 1000 }),
  seed: integer('seed'),
  points: integer('points').default(0).notNull(),
  /**
   * Bản sao cờ isRanked của giải tại lúc đăng ký, KHÔNG phải sự đồng ý của người chơi. Sự đồng ý thật nằm ở tournament_rosters.rankingConsentAt.
   */
  rankingConsent: boolean('ranking_consent').default(false).notNull(),
  customResponses: jsonb('custom_responses'),
  /**
   * Đã đóng phí đăng ký. Chỉ chuyển true khi một payment của đăng ký chuyển sang COMPLETED (payments.repository.ts:364-370).
   */
  isPaid: boolean('is_paid').default(false).notNull(),
  // Set only by the organizer add-athlete pairs flow. The registration fee is
  // never collected for these rows; entryFeeAtRegistration keeps the real fee.
  /**
   * true = organizer miễn phí đăng ký này. Đăng ký như vậy được coi là đã đóng phí (registration-payment-eligibility.ts:20-33).
   */
  organizerWaivedFee: boolean('organizer_waived_fee').default(false).notNull(),
  // Organizer's own day-of-event mark. Carries no meaning anywhere else: it does
  // not gate roster approval, does not affect ELO, and does not block playing.
  isPresent: boolean('is_present').default(false).notNull(),
  // Effective registration fee captured when this participant is created.
  // This is distinct from isPaid: zero means free at registration, while
  // isPaid=true after a paid flow means the payment was captured.
  /**
   * Ảnh chụp phí hiệu lực lúc tạo đăng ký. Khi thanh toán, giá trị này được ưu tiên trước phí giải và phí hạng mục (payments.service.ts:582-591).
   */
  entryFeeAtRegistration: numeric('entry_fee_at_registration', {
    precision: 12,
    scale: 2,
  }).default('0.00').notNull(),
  teamInviteToken: varchar('team_invite_token', { length: 50 }).unique(),
  /**
   * Trạng thái đăng ký. Đôi: WAITLISTED, PENDING_APPROVAL, PENDING_PARTNER, COMPLETE. Đơn: WAITLISTED, PENDING, PENDING_APPROVAL, COMPLETE (tournament-participant-status.ts:26-30, 61-65).
   * Giữ suất trong sức chứa: PENDING, PENDING_APPROVAL, PENDING_PARTNER, COMPLETE (tournament-participant-status.ts:85-90). Mặc định PENDING.
   */
  teamStatus: varchar('team_status', { length: 50 }).default('PENDING').notNull(),
  /**
   * Nguồn ghép cặp: UNKNOWN (mặc định), MANUAL (ghép tay, ví dụ khi nhập danh sách từ file: tournament-import.repository.ts:964-966), SYSTEM.
   * Ràng buộc CHECK: tournament_participants_pairing_source_check.
   */
  pairingSource: varchar('pairing_source', { length: 20 }).default('UNKNOWN').notNull(),
  partnerUserId: uuid('partner_user_id').references(() => users.id, { onDelete: 'restrict' }),
  partnerInviteExpiresAt: timestamp('partner_invite_expires_at', { withTimezone: true }),
  isMock: boolean('is_mock').default(false).notNull(),
  isWildcard: boolean('is_wildcard').default(false).notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  rosterLockedAt: timestamp('roster_locked_at', { withTimezone: true }),
}, (table) => ({
  idxParticipantsTournamentStatus: index('idx_participants_tournament_status').on(
    table.tournamentId,
    table.teamStatus,
  ),
  idxParticipantsTournamentId: index('idx_participants_tournament_id').on(
    table.tournamentId,
  ),
  idxParticipantsDivisionStatus: index(
    'idx_participants_division_status',
  ).on(table.tournamentDivisionId, table.teamStatus),
  pairingSourceCheck: check(
    'tournament_participants_pairing_source_check',
    sql`${table.pairingSource} in ('UNKNOWN', 'MANUAL', 'SYSTEM')`,
  ),
}));

export const tournamentRosters = pgTable('tournament_rosters', {
  id: uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id')
    .references(() => tournamentParticipants.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  role: varchar('role', { length: 50 }).default('MAIN').notNull(),
  // Team sport: status mời — INVITED (chưa accept) / ACTIVE / REMOVED
  status: varchar('status', { length: 20 }).default('ACTIVE').notNull(),
  // When THIS user agreed to have their results ranked in THIS tournament.
  //
  // Lives here, not on tournament_participants, because ELO is applied per
  // tournament_rosters.userId: a team participant can carry several users
  // (MAIN + RESERVE), so a single per-participant timestamp cannot tell whose
  // consent it is — one user confirming would hand every team-mate their score.
  //
  // NULL means not confirmed. Distinct from tournament_participants.ranking_consent,
  // which is only a copy of the tournament's isRanked flag.
  //
  // Business rule: a match counts only when matches.completedAt >= this instant.
  // Matches played before confirming stay permanently unscored, so nobody can be
  // force-enrolled and then have old results land against them.
  rankingConsentAt: timestamp('ranking_consent_at', { withTimezone: true }),
  // When THIS user's account link to the roster was confirmed (email consent).
  //
  // NULL = not confirmed. Default NULL on purpose: every new row (self-registration,
  // organizer or captain assignment) starts unconfirmed, and only the user's own
  // ranking-consent confirmation sets it. Read only by history and achievements
  // (matches feed, users ranked achievements, my-registration). Scheduling, pairing
  // and brackets never read it. Migration 2026-10-12 backfilled existing rows to the
  // epoch so their history stays visible.
  accountLinkConfirmedAt: timestamp('account_link_confirmed_at', {
    withTimezone: true,
  }),
  joinedAt: timestamp('joined_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  // When the confirmation mail was last queued, and how many times it has been
  // sent. Self-reminders (1-3, then stop) are scheduled from these — without them
  // the scheduler cannot tell "never notified" from "notified and ignored", and
  // the organizer's "awaiting confirmation" view becomes unverifiable.
  consentNotifiedAt: timestamp('consent_notified_at', { withTimezone: true }),
  consentNotifiedCount: integer('consent_notified_count').default(0).notNull(),
}, (table) => ({
  idxRostersParticipantUserUnique: uniqueIndex(
    'tournament_rosters_participant_user_unique_idx',
  ).on(table.participantId, table.userId),
}));

export const tournamentReferees = pgTable('tournament_referees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').references(() => tournaments.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }).notNull(),
  assignedBy: uuid('assigned_by').references(() => users.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).default('INVITED').notNull(), // 'INVITED' | 'ACCEPTED' | 'DECLINED'
  assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentStaff = pgTable('tournament_staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'restrict' })
    .notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const tournamentFollows = pgTable('tournament_follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id')
    .references(() => tournaments.id, { onDelete: 'cascade' })
    .notNull(),
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  uniqueFollow: uniqueIndex('tournament_follows_unique_idx').on(table.tournamentId, table.userId),
}));
