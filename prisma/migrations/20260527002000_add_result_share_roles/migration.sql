ALTER TABLE "EventResultShare"
  ADD COLUMN "publicRole" TEXT NOT NULL DEFAULT 'viewer';

ALTER TABLE "EventResultShareMember"
  ADD COLUMN "role" TEXT NOT NULL DEFAULT 'viewer';
