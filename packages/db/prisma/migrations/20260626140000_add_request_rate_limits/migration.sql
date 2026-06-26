CREATE TABLE "request_rate_limits" (
  "key" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "client_key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "reset_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "request_rate_limits_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "request_rate_limits_scope_reset_at_idx" ON "request_rate_limits"("scope", "reset_at");
