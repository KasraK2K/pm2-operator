ALTER TABLE "user_preferences"
ADD COLUMN "panel_layout" JSONB NOT NULL DEFAULT '{}'::jsonb;
