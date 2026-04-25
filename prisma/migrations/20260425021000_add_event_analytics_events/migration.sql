CREATE TABLE "EventAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "respondentUuid" TEXT,
    "sessionUuid" TEXT,
    "sectionHistory" JSONB NOT NULL DEFAULT '[]',
    "sectionId" TEXT,
    "sectionIndex" INTEGER,
    "progressPercent" DOUBLE PRECISION,
    "deviceType" TEXT,
    "userAgent" TEXT,
    "eventId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventAnalyticsEvent_eventId_type_occurredAt_idx" ON "EventAnalyticsEvent"("eventId", "type", "occurredAt");
CREATE INDEX "EventAnalyticsEvent_eventId_respondentUuid_idx" ON "EventAnalyticsEvent"("eventId", "respondentUuid");
CREATE INDEX "EventAnalyticsEvent_eventId_sessionUuid_idx" ON "EventAnalyticsEvent"("eventId", "sessionUuid");

ALTER TABLE "EventAnalyticsEvent" ADD CONSTRAINT "EventAnalyticsEvent_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
