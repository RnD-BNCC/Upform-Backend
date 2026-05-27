CREATE TABLE "EventResultShare" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventResultShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventResultShare_eventId_key" ON "EventResultShare"("eventId");
CREATE UNIQUE INDEX "EventResultShare_token_key" ON "EventResultShare"("token");
CREATE INDEX "EventResultShare_token_idx" ON "EventResultShare"("token");
CREATE INDEX "EventResultShare_eventId_idx" ON "EventResultShare"("eventId");

ALTER TABLE "EventResultShare"
  ADD CONSTRAINT "EventResultShare_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "EventResultShareMember" (
  "id" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventResultShareMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventResultShareMember_shareId_email_key"
  ON "EventResultShareMember"("shareId", "email");
CREATE INDEX "EventResultShareMember_email_idx" ON "EventResultShareMember"("email");

ALTER TABLE "EventResultShareMember"
  ADD CONSTRAINT "EventResultShareMember_shareId_fkey"
  FOREIGN KEY ("shareId") REFERENCES "EventResultShare"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
