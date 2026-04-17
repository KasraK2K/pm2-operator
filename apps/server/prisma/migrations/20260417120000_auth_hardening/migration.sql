-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- Alter users
ALTER TABLE "users"
ADD COLUMN "role" "UserRole";

UPDATE "users"
SET "role" = 'MEMBER'
WHERE "role" IS NULL;

WITH "first_user" AS (
    SELECT "id"
    FROM "users"
    ORDER BY "created_at" ASC, "id" ASC
    LIMIT 1
)
UPDATE "users"
SET "role" = 'OWNER'
WHERE "id" IN (SELECT "id" FROM "first_user");

ALTER TABLE "users"
ALTER COLUMN "role" SET NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'MEMBER';

CREATE UNIQUE INDEX "users_single_owner_idx"
ON "users"("role")
WHERE "role" = 'OWNER';

-- Shared inventory metadata
ALTER TABLE "ssh_hosts"
DROP CONSTRAINT "ssh_hosts_user_id_fkey";

ALTER TABLE "tags"
DROP CONSTRAINT "tags_user_id_fkey";

DROP INDEX "tags_user_id_name_key";

ALTER TABLE "ssh_hosts"
ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "tags"
ALTER COLUMN "user_id" DROP NOT NULL;

CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

ALTER TABLE "ssh_hosts"
ADD CONSTRAINT "ssh_hosts_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tags"
ADD CONSTRAINT "tags_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
