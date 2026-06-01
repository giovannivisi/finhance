CREATE TYPE "BrokerageOperationKind" AS ENUM ('BUY', 'SELL', 'DIVIDEND', 'FEE');

CREATE TABLE "BrokerageOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "assetId" TEXT,
    "kind" "BrokerageOperationKind" NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "quantity" DECIMAL(20,10),
    "unitPrice" DECIMAL(20,10),
    "grossAmount" DECIMAL(20,10),
    "feeAmount" DECIMAL(20,10),
    "cashAmount" DECIMAL(20,10) NOT NULL,
    "realisedGainLoss" DECIMAL(20,10),
    "notes" TEXT,
    "mirroredTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrokerageOperation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioAssetKindTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "targetPercent" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioAssetKindTarget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioSecurityTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "ticker" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT '',
    "name" TEXT,
    "targetPercent" DECIMAL(8,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioSecurityTarget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrokerageOperation_mirroredTransactionId_key" ON "BrokerageOperation"("mirroredTransactionId");
CREATE INDEX "BrokerageOperation_userId_accountId_postedAt_idx" ON "BrokerageOperation"("userId", "accountId", "postedAt" DESC);
CREATE INDEX "BrokerageOperation_userId_assetId_postedAt_idx" ON "BrokerageOperation"("userId", "assetId", "postedAt" DESC);

CREATE UNIQUE INDEX "PortfolioAssetKindTarget_userId_kind_key" ON "PortfolioAssetKindTarget"("userId", "kind");
CREATE INDEX "PortfolioAssetKindTarget_userId_kind_idx" ON "PortfolioAssetKindTarget"("userId", "kind");

CREATE UNIQUE INDEX "PortfolioSecurityTarget_userId_kind_ticker_exchange_key" ON "PortfolioSecurityTarget"("userId", "kind", "ticker", "exchange");
CREATE INDEX "PortfolioSecurityTarget_userId_kind_ticker_exchange_idx" ON "PortfolioSecurityTarget"("userId", "kind", "ticker", "exchange");

ALTER TABLE "BrokerageOperation" ADD CONSTRAINT "BrokerageOperation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BrokerageOperation" ADD CONSTRAINT "BrokerageOperation_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrokerageOperation" ADD CONSTRAINT "BrokerageOperation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BrokerageOperation" ADD CONSTRAINT "BrokerageOperation_mirroredTransactionId_fkey" FOREIGN KEY ("mirroredTransactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PortfolioAssetKindTarget" ADD CONSTRAINT "PortfolioAssetKindTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioSecurityTarget" ADD CONSTRAINT "PortfolioSecurityTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
