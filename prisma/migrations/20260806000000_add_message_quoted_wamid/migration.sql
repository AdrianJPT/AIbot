-- AlterTable
ALTER TABLE "Message" ADD COLUMN "quotedWamid" TEXT;

-- Metadata-only in PG 11+ (nullable, no default, no backfill). Deliberately no
-- index: quotes are resolved by looking up "Message"."wamid", which already
-- carries a unique index, and nothing ever queries by "quotedWamid" itself.
--
-- No backfill is possible either, and that is fine rather than a gap: WhatsApp
-- only tells us what a message replied to on the inbound webhook, so quotes that
-- arrived before this column existed are simply unknown. The resolution path
-- renders an explicit "not available" for them instead of guessing.
