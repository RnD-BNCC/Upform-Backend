ALTER TABLE "EmailBlast"
ADD COLUMN IF NOT EXISTS "eventId" TEXT;

CREATE INDEX IF NOT EXISTS "EmailBlast_eventId_idx" ON "EmailBlast"("eventId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailBlast_eventId_fkey'
  ) THEN
    ALTER TABLE "EmailBlast" ADD CONSTRAINT "EmailBlast_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
