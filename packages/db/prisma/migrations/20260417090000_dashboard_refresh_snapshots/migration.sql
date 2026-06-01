ALTER TABLE "Asset"
ALTER COLUMN "balance" TYPE DECIMAL(20, 10);

ALTER TABLE "Asset"
ALTER COLUMN "lastPrice" TYPE DECIMAL(20, 10);

ALTER TABLE "Asset"
ADD COLUMN "lastFxRate" DECIMAL(20, 10),
ADD COLUMN "lastFxRateAt" TIMESTAMP(3);

UPDATE "Asset"
SET "currency" = UPPER(TRIM("currency"))
WHERE "currency" <> UPPER(TRIM("currency"));

UPDATE "Asset"
SET "ticker" = UPPER(TRIM("ticker"))
WHERE "ticker" IS NOT NULL;

UPDATE "Asset"
SET "exchange" = UPPER(TRIM("exchange"))
WHERE "exchange" IS NOT NULL;

UPDATE "Asset"
SET "exchange" = ''
WHERE "type" = 'ASSET'
  AND "kind" IN ('STOCK', 'BOND')
  AND "ticker" IS NOT NULL
  AND "exchange" IS NULL;

UPDATE "Asset"
SET "exchange" = '_CRYPTO_'
WHERE "type" = 'ASSET'
  AND "kind" = 'CRYPTO'
  AND "ticker" IS NOT NULL
  AND ("exchange" IS NULL OR TRIM("exchange") = '');

UPDATE "Asset"
SET "ticker" = UPPER(TRIM("ticker")) || '-' || UPPER(TRIM("currency"))
WHERE "type" = 'ASSET'
  AND "kind" = 'CRYPTO'
  AND "ticker" IS NOT NULL
  AND POSITION('-' IN UPPER(TRIM("ticker"))) = 0;

CREATE UNIQUE INDEX "Asset_type_kind_ticker_exchange_key"
ON "Asset"("type", "kind", "ticker", "exchange");
