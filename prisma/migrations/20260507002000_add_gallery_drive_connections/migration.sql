CREATE TABLE IF NOT EXISTS "GalleryDriveConnection" (
  "id" TEXT NOT NULL,
  "shareId" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "folderUrl" TEXT NOT NULL,
  "syncEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GalleryDriveConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GalleryDriveConnection_shareId_ownerEmail_key"
ON "GalleryDriveConnection"("shareId", "ownerEmail");

CREATE INDEX IF NOT EXISTS "GalleryDriveConnection_ownerEmail_idx"
ON "GalleryDriveConnection"("ownerEmail");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GalleryDriveConnection_shareId_fkey'
  ) THEN
    ALTER TABLE "GalleryDriveConnection"
    ADD CONSTRAINT "GalleryDriveConnection_shareId_fkey"
    FOREIGN KEY ("shareId") REFERENCES "GalleryShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
