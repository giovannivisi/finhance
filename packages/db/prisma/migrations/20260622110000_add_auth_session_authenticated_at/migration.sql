-- Add a nullable marker for sessions created by a fresh authentication event.
-- Existing sessions stay NULL so they do not automatically satisfy recent-auth
-- checks after this migration is deployed.
ALTER TABLE "auth_sessions" ADD COLUMN "authenticated_at" TIMESTAMP(3);
