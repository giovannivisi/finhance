ALTER TABLE "auth_provider_accounts"
ADD COLUMN "provider_email" TEXT,
ADD COLUMN "provider_email_verified" BOOLEAN,
ADD COLUMN "provider_display_name" TEXT,
ADD COLUMN "created_at" TIMESTAMP(3);
