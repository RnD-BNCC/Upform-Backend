CREATE TABLE "GalleryShare" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "publicRole" TEXT NOT NULL DEFAULT 'viewer',
  "token" TEXT NOT NULL,
  "driveFolderId" TEXT,
  "driveFolderUrl" TEXT,
  "driveSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GalleryShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GalleryShareMember" (
  "id" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'viewer',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GalleryShareMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GalleryShare_eventId_key" ON "GalleryShare"("eventId");
CREATE UNIQUE INDEX "GalleryShare_token_key" ON "GalleryShare"("token");
CREATE INDEX "GalleryShare_token_idx" ON "GalleryShare"("token");
CREATE INDEX "GalleryShare_eventId_idx" ON "GalleryShare"("eventId");
CREATE UNIQUE INDEX "GalleryShareMember_shareId_email_key" ON "GalleryShareMember"("shareId", "email");
CREATE INDEX "GalleryShareMember_email_idx" ON "GalleryShareMember"("email");

ALTER TABLE "GalleryShare"
  ADD CONSTRAINT "GalleryShare_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GalleryShareMember"
  ADD CONSTRAINT "GalleryShareMember_shareId_fkey"
  FOREIGN KEY ("shareId") REFERENCES "GalleryShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
