ALTER TABLE "Account"
ADD COLUMN IF NOT EXISTS "openingBalance" DECIMAL(20,10) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "openingBalanceDate" DATE;

CREATE TABLE "RecurringTransactionRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "kind" "TransactionKind" NOT NULL,
    "amount" DECIMAL(20,10) NOT NULL,
    "dayOfMonth" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "accountId" TEXT,
    "direction" "TransactionDirection",
    "categoryId" TEXT,
    "counterparty" TEXT,
    "sourceAccountId" TEXT,
    "destinationAccountId" TEXT,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "lastMaterializationError" TEXT,
    "lastMaterializationErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTransactionRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "recurringRuleId" TEXT,
ADD COLUMN IF NOT EXISTS "recurringOccurrenceMonth" DATE;

CREATE INDEX "RecurringTransactionRule_userId_isActive_dayOfMonth_startDate_idx"
ON "RecurringTransactionRule"("userId", "isActive", "dayOfMonth", "startDate");

CREATE INDEX "RecurringTransactionRule_userId_accountId_idx"
ON "RecurringTransactionRule"("userId", "accountId");

CREATE INDEX "RecurringTransactionRule_userId_sourceAccountId_idx"
ON "RecurringTransactionRule"("userId", "sourceAccountId");

CREATE INDEX "RecurringTransactionRule_userId_destinationAccountId_idx"
ON "RecurringTransactionRule"("userId", "destinationAccountId");

CREATE INDEX "Transaction_userId_recurringRuleId_recurringOccurrenceMonth_idx"
ON "Transaction"("userId", "recurringRuleId", "recurringOccurrenceMonth");

CREATE UNIQUE INDEX "Transaction_userId_recurringRuleId_recurringOccurrenceMonth_direction_key"
ON "Transaction"("userId", "recurringRuleId", "recurringOccurrenceMonth", "direction");

ALTER TABLE "RecurringTransactionRule"
ADD CONSTRAINT "RecurringTransactionRule_accountId_userId_fkey"
FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringTransactionRule"
ADD CONSTRAINT "RecurringTransactionRule_categoryId_userId_fkey"
FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringTransactionRule"
ADD CONSTRAINT "RecurringTransactionRule_sourceAccountId_userId_fkey"
FOREIGN KEY ("sourceAccountId", "userId") REFERENCES "Account"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RecurringTransactionRule"
ADD CONSTRAINT "RecurringTransactionRule_destinationAccountId_userId_fkey"
FOREIGN KEY ("destinationAccountId", "userId") REFERENCES "Account"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_recurringRuleId_fkey"
FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringTransactionRule"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
