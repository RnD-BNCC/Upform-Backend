ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'admin';

UPDATE "User"
SET "role" = 'admin', "updatedAt" = CURRENT_TIMESTAMP
WHERE "role" NOT IN ('admin', 'activist', 'permission_approver');

ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "User_role_check";

ALTER TABLE "User"
ADD CONSTRAINT "User_role_check"
CHECK ("role" IN ('admin', 'activist', 'permission_approver'));

UPDATE "User"
SET "role" = 'permission_approver', "updatedAt" = CURRENT_TIMESTAMP
WHERE lower("email") IN (
    'andrianpratama843@gmail.com',
    'mrpartys05@gmail.com',
    'valentinakriswandaru@gmail.com',
    'xandertrevor273@gmail.com',
    'sebastianronny0708@gmail.com',
    'eeoalsut@bncc.net',
    'partnership.alsut@bncc.net',
    'hrd.alsut@bncc.net',
    'lntalsut@bncc.net',
    'dpialsut@bncc.net',
    'rndalsut@bncc.net'
)
AND "role" <> 'activist';
