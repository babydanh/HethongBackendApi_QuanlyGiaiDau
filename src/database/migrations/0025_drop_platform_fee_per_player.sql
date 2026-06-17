-- Remove fixed platform fee per player.
-- Platform fee is now calculated from entry_fee * platform_fee_percentage.
ALTER TABLE "tournaments" DROP COLUMN IF EXISTS "platform_fee_per_player";--> statement-breakpoint
