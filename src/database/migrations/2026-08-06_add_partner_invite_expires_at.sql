-- Migration: add partner_invite_expires_at to tournament_participants
-- NGUYÊN NHÂN 500: commit beb05ee thêm cột này vào Drizzle schema
-- (tournaments.schema.ts:185) NHƯNG chưa có migration nào tạo cột.
-- Live DB (dựng từ migration .sql) thiếu cột -> mọi .returning() trên
-- tournament_participants (mock-participants, register...) báo 42703
-- undefined_column -> HTTP 500.
-- Cột nullable timestamptz, đúng định nghĩa schema (không NOT NULL/default).
ALTER TABLE "tournament_participants" ADD COLUMN IF NOT EXISTS "partner_invite_expires_at" timestamptz;
