ALTER TABLE "user_preferences"
ADD COLUMN "shortcuts" JSONB NOT NULL DEFAULT '{}'::jsonb;

