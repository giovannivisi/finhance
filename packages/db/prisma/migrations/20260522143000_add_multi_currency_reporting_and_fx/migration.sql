-- CreateEnum
CREATE TYPE "FxRateSource" AS ENUM ('LIVE', 'MANUAL');

-- AlterTable
ALTER TABLE "NetWorthSnapshot"
ADD COLUMN "nativeAssetTotals" JSONB,
ADD COLUMN "nativeLiabilityTotals" JSONB;

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "nativeAmount" DECIMAL(20, 10),
ADD COLUMN "nativeCurrency" TEXT,
ADD COLUMN "fxRateUsed" DECIMAL(20, 10),
ADD COLUMN "fxRateSource" "FxRateSource";

-- CreateTable
CREATE TABLE "FxRate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "rateDate" DATE NOT NULL,
  "fromCurrency" TEXT NOT NULL,
  "toCurrency" TEXT NOT NULL,
  "rate" DECIMAL(20, 10) NOT NULL,
  "source" "FxRateSource" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FxRate_userId_rateDate_fromCurrency_toCurrency_key"
ON "FxRate"("userId", "rateDate", "fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "FxRate_userId_fromCurrency_toCurrency_rateDate_idx"
ON "FxRate"("userId", "fromCurrency", "toCurrency", "rateDate");

-- AddForeignKey
ALTER TABLE "FxRate"
ADD CONSTRAINT "FxRate_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
