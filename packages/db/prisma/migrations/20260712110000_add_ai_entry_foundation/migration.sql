CREATE TYPE "AiUsageEventStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED');

CREATE TYPE "CloudParserConsentAction" AS ENUM ('GRANTED', 'WITHDRAWN');

CREATE TABLE "ai_usage_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "status" "AiUsageEventStatus" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cloud_parser_consent_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "action" "CloudParserConsentAction" NOT NULL,
  "notice_version" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cloud_parser_consent_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_events_user_id_created_at_idx"
  ON "ai_usage_events"("user_id", "created_at");

CREATE INDEX "ai_usage_events_created_at_idx"
  ON "ai_usage_events"("created_at");

CREATE UNIQUE INDEX "cloud_parser_consent_events_request_id_key"
  ON "cloud_parser_consent_events"("request_id");

CREATE INDEX "cloud_parser_consent_events_user_id_created_at_idx"
  ON "cloud_parser_consent_events"("user_id", "created_at");

ALTER TABLE "ai_usage_events"
  ADD CONSTRAINT "ai_usage_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cloud_parser_consent_events"
  ADD CONSTRAINT "cloud_parser_consent_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
