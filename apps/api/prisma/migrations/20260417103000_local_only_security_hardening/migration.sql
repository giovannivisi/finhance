UPDATE "Asset"
SET "userId" = 'local-dev'
WHERE "userId" IS NULL OR BTRIM("userId") = '';

DROP INDEX IF EXISTS "Asset_type_kind_ticker_exchange_key";

ALTER TABLE "Asset"
ALTER COLUMN "userId" SET NOT NULL;

CREATE INDEX "Asset_userId_idx"
ON "Asset"("userId");

CREATE UNIQUE INDEX "Asset_userId_type_kind_ticker_exchange_key"
ON "Asset"("userId", "type", "kind", "ticker", "exchange");

CREATE TABLE "PortfolioState" (
    "userId" TEXT NOT NULL,
    "lastRefreshRequestedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioState_pkey" PRIMARY KEY ("userId")
);
