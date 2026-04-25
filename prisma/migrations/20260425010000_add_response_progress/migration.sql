-- AlterTable
ALTER TABLE "Response"
ADD COLUMN "respondentUuid" TEXT,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "deviceType" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "sectionHistory" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "currentSectionId" TEXT,
ADD COLUMN "currentSectionIndex" INTEGER,
ADD COLUMN "progressPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "ResponseProgress" (
    "id" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "otherTexts" JSONB NOT NULL DEFAULT '{}',
    "respondentUuid" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deviceType" TEXT,
    "userAgent" TEXT,
    "sectionHistory" JSONB NOT NULL DEFAULT '[]',
    "currentSectionId" TEXT,
    "currentSectionIndex" INTEGER,
    "progressPercent" DOUBLE PRECISION,
    "eventId" TEXT NOT NULL,

    CONSTRAINT "ResponseProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResponseProgress_eventId_idx" ON "ResponseProgress"("eventId");

-- CreateIndex
CREATE INDEX "ResponseProgress_eventId_respondentUuid_idx" ON "ResponseProgress"("eventId", "respondentUuid");

-- AddForeignKey
ALTER TABLE "ResponseProgress" ADD CONSTRAINT "ResponseProgress_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
