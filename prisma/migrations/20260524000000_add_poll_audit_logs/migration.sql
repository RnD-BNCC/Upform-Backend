CREATE TABLE "PollAuditLog" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "actorEmail" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PollAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PollAuditLog_pollId_createdAt_idx" ON "PollAuditLog"("pollId", "createdAt");
CREATE INDEX "PollAuditLog_actorEmail_idx" ON "PollAuditLog"("actorEmail");
CREATE INDEX "PollAuditLog_action_idx" ON "PollAuditLog"("action");

ALTER TABLE "PollAuditLog" ADD CONSTRAINT "PollAuditLog_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
