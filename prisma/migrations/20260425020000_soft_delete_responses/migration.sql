ALTER TABLE "Response" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ResponseProgress" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Response_eventId_deletedAt_idx" ON "Response"("eventId", "deletedAt");
CREATE INDEX "ResponseProgress_eventId_deletedAt_idx" ON "ResponseProgress"("eventId", "deletedAt");
