import {
  check,
  customType,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { categories } from './categories.schema';
import { communities } from './communities.schema';
import { tournamentVenues, venueCourts } from './venues.schema';
import { users } from './users.schema';

const geography = customType<{ data: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

/**
 * Social Session (Kèo giao lưu thể thao — Social của Flutter).
 * - communityId nullable: NULL = kèo cá nhân (nút "Xóa CLB"); có giá trị = kèo thuộc CLB.
 * - play_date tách riêng khỏi start_at để query list-theo-ngày nhanh; phải luôn = start_at::date.
 */
export const socialSessions = pgTable(
  'social_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    shortCode: varchar('short_code', { length: 16 }).notNull(),
    communityId: uuid('community_id').references(() => communities.id, {
      onDelete: 'cascade',
    }),
    hostUserId: uuid('host_user_id')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    categoryId: uuid('category_id')
      .references(() => categories.id, { onDelete: 'restrict' })
      .notNull(),
    title: varchar('title', { length: 100 }).notNull(),
    description: text('description'),
    /** Hình thức chơi. Mặc định 'Giao lưu'; giá trị hợp lệ định nghĩa trong social-session.dto.ts (SOCIAL_PLAY_FORMATS). */
    playFormat: varchar('play_format', { length: 30 })
      .default('Giao lưu')
      .notNull(),
    playDate: date('play_date').notNull(),
    startAt: timestamp('start_at', { withTimezone: true }).notNull(),
    durationMinutes: integer('duration_minutes').default(120).notNull(),
    venueName: varchar('venue_name', { length: 255 }).notNull(),
    venueAddress: varchar('venue_address', { length: 500 }).notNull(),
    // Tọa độ sân do host ghim trên bản đồ (nullable: kèo cũ chưa có tọa độ).
    // venueGeolocation là PostGIS geography để query ST_Distance/ST_DWithin.
    latitude: doublePrecision('latitude'),
    longitude: doublePrecision('longitude'),
    venueGeolocation: geography('venue_geolocation'),
    // Mã địa phương suy ra từ địa chỉ hoặc từ pin (nullable, không FK — xem
    // migration 2026-09-29). Cho phép tái dựng vùng khi mở lại kèo cũ.
    provinceCode: varchar('province_code', { length: 20 }),
    wardCode: varchar('ward_code', { length: 20 }),
    venueId: uuid('venue_id').references(() => tournamentVenues.id, {
      onDelete: 'set null',
    }),
    courtId: uuid('court_id').references(() => venueCourts.id, {
      onDelete: 'set null',
    }),
    /** Yêu cầu giới tính của kèo. Ràng buộc DB: ANY, MALE, FEMALE, MIXED. Chưa thấy kiểm tra lúc tham gia (xem open questions). */
    genderRequirement: varchar('gender_requirement', { length: 20 })
      .default('ANY')
      .notNull(),
    /** Khóa chống tạo kèo trùng do client gửi, duy nhất theo host. Luôn đi cùng creationFingerprint (social_session_create_idempotency_pair_check). */
    creationIdempotencyKey: varchar('creation_idempotency_key', {
      length: 128,
    }),
    creationFingerprint: varchar('creation_fingerprint', { length: 64 }),
    /** Số chỗ tối đa, giới hạn 2–64 (social_session_capacity_check). */
    maxSlots: integer('max_slots').default(6).notNull(),
    /** Số chỗ đã giữ: tổng ticketCount của người có status JOINED (host tính 1). Khi đạt maxSlots, status chuyển FULL (social-sessions.repository.ts:843-845). */
    currentSlots: integer('current_slots').default(1).notNull(),
    /** Giá 1 vé (VND); 0 = miễn phí (social-session.dto.ts). */
    feePerSlot: integer('fee_per_slot').default(0).notNull(),
    levelRequirement: varchar('level_requirement', { length: 50 })
      .default('ALL')
      .notNull(),
    /** PUBLIC (ai cũng xem) hoặc CLUB_ONLY (chỉ thành viên JOINED của CLB; bắt buộc có communityId) (social_session_visibility_check). */
    visibility: varchar('visibility', { length: 20 }).default('PUBLIC').notNull(),
    contactPhone: varchar('contact_phone', { length: 20 }),
    zaloGroupUrl: text('zalo_group_url'),
    /**
     * Trạng thái kèo: OPEN (đang nhận người), FULL (đủ chỗ), COMPLETED (đã kết thúc), CANCELLED (đã hủy).
     * OPEN và FULL đổi qua lại theo số chỗ. Kèo đã hủy hoặc kết thúc không nhận người (SESSION_CLOSED).
     */
    status: varchar('status', { length: 20 }).default('OPEN').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    statusCheck: check(
      'social_session_status_check',
      sql`${table.status} IN ('OPEN', 'FULL', 'COMPLETED', 'CANCELLED')`,
    ),
    capacityCheck: check(
      'social_session_capacity_check',
      sql`${table.maxSlots} BETWEEN 2 AND 64 AND ${table.currentSlots} BETWEEN 1 AND ${table.maxSlots}`,
    ),
    feeCheck: check('social_session_fee_check', sql`${table.feePerSlot} >= 0`),
    visibilityCheck: check(
      'social_session_visibility_check',
      sql`${table.visibility} IN ('PUBLIC', 'CLUB_ONLY') AND (${table.visibility} <> 'CLUB_ONLY' OR ${table.communityId} IS NOT NULL)`,
    ),
    venueCourtCheck: check(
      'social_session_venue_court_check',
      sql`${table.courtId} IS NULL OR ${table.venueId} IS NOT NULL`,
    ),
    genderRequirementCheck: check(
      'social_session_gender_requirement_check',
      sql`${table.genderRequirement} IN ('ANY', 'MALE', 'FEMALE', 'MIXED')`,
    ),
    idempotencyPairCheck: check(
      'social_session_create_idempotency_pair_check',
      sql`(${table.creationIdempotencyKey} IS NULL) = (${table.creationFingerprint} IS NULL)`,
    ),
    geoConsistencyCheck: check(
      'social_session_geo_consistency_check',
      sql`(
        (${table.venueGeolocation} IS NULL AND ${table.latitude} IS NULL AND ${table.longitude} IS NULL)
        OR (${table.venueGeolocation} IS NOT NULL AND ${table.latitude} IS NOT NULL AND ${table.longitude} IS NOT NULL
          AND ${table.latitude} BETWEEN -90 AND 90 AND ${table.longitude} BETWEEN -180 AND 180
          AND abs(${table.latitude} - ST_Y(${table.venueGeolocation}::geometry)) <= 1e-7
          AND abs(${table.longitude} - ST_X(${table.venueGeolocation}::geometry)) <= 1e-7)
      )`,
    ),
    createIdempotencyUnique: uniqueIndex(
      'social_session_create_idempotency_idx',
    )
      .on(table.hostUserId, table.creationIdempotencyKey)
      .where(sql`${table.creationIdempotencyKey} IS NOT NULL`),
    dateIdx: index('social_session_date_idx').on(
      table.playDate,
      table.status,
      table.categoryId,
    ),
    communityIdx: index('social_session_community_idx').on(
      table.communityId,
      table.status,
    ),
    hostIdx: index('social_session_host_idx').on(table.hostUserId),
    geoIdx: index('social_session_geo_idx').using(
      'gist',
      table.venueGeolocation,
    ),
    wardCodeIdx: index('social_session_ward_code_idx').on(table.wardCode),
    shortCodeIdx: uniqueIndex('social_session_short_code_idx').on(table.shortCode),
  }),
);

/**
 * Social Session Participant (1 row = 1 participant/request identity).
 * - userId nullable: NULL = khách ngoài CLB (guest, không cần tài khoản).
 * - REQUESTED is not a reserved slot; only JOINED contributes to currentSlots.
 * - Non-JOINED rows remain for request/join history.
 */
export const socialSessionParticipants = pgTable(
  'social_session_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => socialSessions.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    guestName: varchar('guest_name', { length: 100 }),
    role: varchar('role', { length: 20 }).default('PLAYER').notNull(),
    status: varchar('status', { length: 20 }).default('JOINED').notNull(),
    paymentStatus: varchar('payment_status', { length: 20 })
      .default('UNPAID')
      .notNull(),
    ticketCount: integer('ticket_count').default(1).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true }),
  },
  (table) => ({
    uniqueUserSession: uniqueIndex(
      'social_session_participants_unique_user',
    ).on(table.sessionId, table.userId),
    roleCheck: check(
      'social_session_participants_role_check',
      sql`${table.role} IN ('HOST', 'PLAYER')`,
    ),
    statusCheck: check(
      'social_session_participants_status_check',
      sql`${table.status} IN ('JOINED', 'REQUESTED', 'REJECTED', 'CANCELLED', 'KICKED')`,
    ),
    requestUserCheck: check(
      'social_session_request_user_check',
      sql`${table.status} NOT IN ('REQUESTED', 'REJECTED') OR ${table.userId} IS NOT NULL`,
    ),
    paymentCheck: check(
      'social_session_participants_payment_check',
      sql`${table.paymentStatus} IN ('UNPAID', 'PAID', 'PENDING')`,
    ),
    ticketCheck: check(
      'social_session_participants_ticket_check',
      sql`${table.ticketCount} >= 1`,
    ),
    guestCheck: check(
      'social_session_participants_guest_check',
      sql`(${table.userId} IS NOT NULL OR ${table.guestName} IS NOT NULL)`,
    ),
    sessionIdx: index('social_session_participants_session_idx').on(
      table.sessionId,
      table.status,
    ),
    pendingRequestsIdx: index('social_session_pending_requests_idx').on(
      table.sessionId,
      table.status,
      table.requestedAt,
    ),
  }),
);
