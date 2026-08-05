-- Make five seconds the default for businesses created outside the app path.
ALTER TABLE "Business" ALTER COLUMN "replyWindowMs" SET DEFAULT 5000;

-- Existing zero values predate the new product default. Preserve every
-- business that already has a custom non-zero window.
UPDATE "Business"
SET "replyWindowMs" = 5000
WHERE "replyWindowMs" = 0;
