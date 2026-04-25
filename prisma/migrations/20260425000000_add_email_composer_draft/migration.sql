CREATE TABLE IF NOT EXISTS "EmailComposerDraft" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "emailStyle" TEXT NOT NULL DEFAULT 'formatted',
    "emailThemeValue" TEXT,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "recipientMode" TEXT NOT NULL DEFAULT 'manual',
    "manualRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "selectedEmailFieldIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "excludedRecipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailComposerDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmailComposerDraft_eventId_key" ON "EmailComposerDraft"("eventId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'EmailComposerDraft_eventId_fkey'
  ) THEN
    ALTER TABLE "EmailComposerDraft" ADD CONSTRAINT "EmailComposerDraft_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
