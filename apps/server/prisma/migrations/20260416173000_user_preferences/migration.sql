-- CreateTable
CREATE TABLE "user_preferences" (
    "user_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL DEFAULT 'midnight-ops',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "user_preferences_theme_id_check" CHECK ("theme_id" IN (
        'midnight-ops',
        'graphite',
        'terminal-green',
        'ocean-depth',
        'ember-watch',
        'arctic-light',
        'sandstone',
        'signal-neon'
    ))
);

-- Backfill existing users
INSERT INTO "user_preferences" ("user_id", "theme_id", "created_at", "updated_at")
SELECT "id", 'midnight-ops', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users"
ON CONFLICT ("user_id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "user_preferences"
ADD CONSTRAINT "user_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
