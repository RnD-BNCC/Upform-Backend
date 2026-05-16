ALTER TABLE "Event"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT;

UPDATE "Event"
SET "stsrc" = 'D'
WHERE "deletedAt" IS NOT NULL;

UPDATE "Event"
SET "stsrc" = 'A'
WHERE "deletedAt" IS NULL
  AND "stsrc" = 'D';

CREATE INDEX IF NOT EXISTS "Event_stsrc_idx" ON "Event"("stsrc");
