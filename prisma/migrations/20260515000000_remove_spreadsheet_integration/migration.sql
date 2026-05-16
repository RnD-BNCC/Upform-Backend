ALTER TABLE "Event"
  DROP COLUMN IF EXISTS "spreadsheetId",
  DROP COLUMN IF EXISTS "spreadsheetUrl",
  DROP COLUMN IF EXISTS "spreadsheetToken";
