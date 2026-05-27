ALTER TABLE "Event" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';
ALTER TABLE "Poll" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'private';

CREATE INDEX "Event_visibility_idx" ON "Event"("visibility");
CREATE INDEX "Poll_visibility_idx" ON "Poll"("visibility");
