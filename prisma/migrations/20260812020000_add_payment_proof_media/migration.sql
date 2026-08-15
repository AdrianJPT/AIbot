-- Payment verification engine, slice 3 of 4: persist proof media for later
-- owner preview. Meta's CDN media id (PaymentProof.waMediaId) expires ~30
-- days, and slice 2's analysis job downloaded/hashed/discarded the buffer
-- without storing it (documented gap, see docs/payment-verification-engine.md
-- decision 8 and tasks #568 PR3 phase 2). MVP storage: inline bytea column on
-- PaymentProof — no external object store (S3/Supabase Storage bucket) exists
-- anywhere else in this repo to reuse, so this avoids inventing new
-- infrastructure for a v1 feature. Revisit if proof volume/size makes row
-- size a problem.
--
-- The two `pg_trgm` indexes (Conversation.customerName / customerPhone,
-- migrations 20260811000005/6) exist in the DB but aren't declared as
-- `@@index` in schema.prisma, so a raw `prisma migrate diff` against the
-- live test DB wants to drop them — unrelated to this change, stripped from
-- this file, same precedent as slices 1/2's migrations.

-- AlterTable
ALTER TABLE "PaymentProof" ADD COLUMN     "mediaData" BYTEA,
ADD COLUMN     "mediaMimeType" TEXT;
