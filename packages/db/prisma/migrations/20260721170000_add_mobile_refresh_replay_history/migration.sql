CREATE TABLE "mobile_consumed_refresh_tokens" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "consumed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_consumed_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mobile_consumed_refresh_tokens_token_hash_key"
ON "mobile_consumed_refresh_tokens"("token_hash");

CREATE INDEX "mobile_consumed_refresh_tokens_session_id_idx"
ON "mobile_consumed_refresh_tokens"("session_id");

ALTER TABLE "mobile_consumed_refresh_tokens"
ADD CONSTRAINT "mobile_consumed_refresh_tokens_session_id_fkey"
FOREIGN KEY ("session_id") REFERENCES "mobile_sessions"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
