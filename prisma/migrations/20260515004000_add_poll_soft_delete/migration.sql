ALTER TABLE "Poll"
  ADD COLUMN IF NOT EXISTS "stsrc" TEXT NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS "createdBy" TEXT,
  ADD COLUMN IF NOT EXISTS "updatedBy" TEXT,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

UPDATE "Poll"
SET "stsrc" = 'D'
WHERE "deletedAt" IS NOT NULL;

UPDATE "Poll"
SET "stsrc" = 'A'
WHERE "deletedAt" IS NULL AND "stsrc" = 'D';

CREATE INDEX IF NOT EXISTS "Poll_stsrc_idx" ON "Poll"("stsrc");
CREATE INDEX IF NOT EXISTS "Poll_deletedAt_idx" ON "Poll"("deletedAt");
