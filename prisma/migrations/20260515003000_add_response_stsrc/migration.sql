ALTER TABLE "Response"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A';

ALTER TABLE "ResponseProgress"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A';

UPDATE "Response"
SET "stsrc" = 'D'
WHERE "deletedAt" IS NOT NULL;

UPDATE "Response"
SET "stsrc" = 'A'
WHERE "deletedAt" IS NULL
  AND "stsrc" = 'D';

UPDATE "ResponseProgress"
SET "stsrc" = 'D'
WHERE "deletedAt" IS NOT NULL;

UPDATE "ResponseProgress"
SET "stsrc" = 'A'
WHERE "deletedAt" IS NULL
  AND "stsrc" = 'D';

CREATE INDEX IF NOT EXISTS "Response_eventId_stsrc_idx" ON "Response"("eventId", "stsrc");
CREATE INDEX IF NOT EXISTS "ResponseProgress_eventId_stsrc_idx" ON "ResponseProgress"("eventId", "stsrc");
