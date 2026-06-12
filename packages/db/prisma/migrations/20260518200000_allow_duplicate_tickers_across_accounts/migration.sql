-- DropIndex
DROP INDEX IF EXISTS "Asset_userId_type_kind_ticker_exchange_key";

-- CreateIndex
CREATE UNIQUE INDEX "Asset_userId_type_kind_ticker_exchange_accountId_key" ON "Asset"("userId", "type", "kind", "ticker", "exchange", "accountId");
