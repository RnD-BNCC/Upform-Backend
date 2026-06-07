ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'admin';

CREATE TABLE "PermissionRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT,
    "requesterEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FormAuditLog" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "actorEmail" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "User_role_idx" ON "User"("role");
CREATE INDEX "PermissionRequest_requesterEmail_status_idx" ON "PermissionRequest"("requesterEmail", "status");
CREATE INDEX "PermissionRequest_action_resourceType_resourceId_status_idx" ON "PermissionRequest"("action", "resourceType", "resourceId", "status");
CREATE INDEX "PermissionRequest_createdAt_idx" ON "PermissionRequest"("createdAt");
CREATE INDEX "FormAuditLog_eventId_createdAt_idx" ON "FormAuditLog"("eventId", "createdAt");
CREATE INDEX "FormAuditLog_actorEmail_idx" ON "FormAuditLog"("actorEmail");
CREATE INDEX "FormAuditLog_action_idx" ON "FormAuditLog"("action");

ALTER TABLE "PermissionRequest" ADD CONSTRAINT "PermissionRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FormAuditLog" ADD CONSTRAINT "FormAuditLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

