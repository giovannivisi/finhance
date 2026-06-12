-- CreateTable
CREATE TABLE "NetWorthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "baseCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "assetsTotal" DECIMAL(20, 10) NOT NULL,
    "liabilitiesTotal" DECIMAL(20, 10) NOT NULL,
    "netWorthTotal" DECIMAL(20, 10) NOT NULL,
    "unavailableCount" INTEGER NOT NULL DEFAULT 0,
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetWorthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NetWorthSnapshot_userId_snapshotDate_baseCurrency_key"
ON "NetWorthSnapshot"("userId", "snapshotDate", "baseCurrency");

-- CreateIndex
CREATE INDEX "NetWorthSnapshot_userId_snapshotDate_idx"
ON "NetWorthSnapshot"("userId", "snapshotDate");
