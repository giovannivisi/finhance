CREATE TYPE "InvestmentPlanCadence" AS ENUM ('MONTHLY', 'TWICE_MONTHLY');
CREATE TYPE "InvestmentPlanOccurrenceStatus" AS ENUM ('COMPLETED', 'SKIPPED');

CREATE TABLE "InvestmentPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "securityName" TEXT NOT NULL,
    "securityKind" "AssetKind" NOT NULL,
    "securityTicker" TEXT NOT NULL,
    "securityExchange" TEXT,
    "currency" TEXT NOT NULL,
    "contributionAmount" DECIMAL(20,10) NOT NULL,
    "estimatedFeeAmount" DECIMAL(20,10),
    "cadence" "InvestmentPlanCadence" NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "secondDayOfMonth" INTEGER,
    "nextScheduledDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvestmentPlanOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "investmentPlanId" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "status" "InvestmentPlanOccurrenceStatus" NOT NULL,
    "brokerageOperationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPlanOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvestmentPlanOccurrence_brokerageOperationId_key" ON "InvestmentPlanOccurrence"("brokerageOperationId");
CREATE UNIQUE INDEX "InvestmentPlanOccurrence_investmentPlanId_scheduledFor_key" ON "InvestmentPlanOccurrence"("investmentPlanId", "scheduledFor");
CREATE INDEX "InvestmentPlan_userId_isActive_nextScheduledDate_idx" ON "InvestmentPlan"("userId", "isActive", "nextScheduledDate");
CREATE INDEX "InvestmentPlan_userId_accountId_idx" ON "InvestmentPlan"("userId", "accountId");
CREATE INDEX "InvestmentPlanOccurrence_userId_scheduledFor_idx" ON "InvestmentPlanOccurrence"("userId", "scheduledFor");
CREATE INDEX "InvestmentPlanOccurrence_userId_investmentPlanId_scheduledFor_idx" ON "InvestmentPlanOccurrence"("userId", "investmentPlanId", "scheduledFor");

ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestmentPlan" ADD CONSTRAINT "InvestmentPlan_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentPlanOccurrence" ADD CONSTRAINT "InvestmentPlanOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvestmentPlanOccurrence" ADD CONSTRAINT "InvestmentPlanOccurrence_investmentPlanId_fkey" FOREIGN KEY ("investmentPlanId") REFERENCES "InvestmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentPlanOccurrence" ADD CONSTRAINT "InvestmentPlanOccurrence_brokerageOperationId_fkey" FOREIGN KEY ("brokerageOperationId") REFERENCES "BrokerageOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
