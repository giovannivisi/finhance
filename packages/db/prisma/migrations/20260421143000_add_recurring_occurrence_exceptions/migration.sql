DO $$
BEGIN
  CREATE TYPE "RecurringOccurrenceStatus" AS ENUM ('SKIPPED', 'OVERRIDDEN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "RecurringTransactionOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recurringRuleId" TEXT NOT NULL,
    "occurrenceMonth" DATE NOT NULL,
    "status" "RecurringOccurrenceStatus" NOT NULL,
    "overrideAmount" DECIMAL(20,10),
    "overridePostedAtDate" DATE,
    "overrideAccountId" TEXT,
    "overrideDirection" "TransactionDirection",
    "overrideCategoryId" TEXT,
    "overrideCounterparty" TEXT,
    "overrideSourceAccountId" TEXT,
    "overrideDestinationAccountId" TEXT,
    "overrideDescription" TEXT,
    "overrideNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTransactionOccurrence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecurringTransactionOccurrence_recurringRuleId_occurrenceMonth_key"
ON "RecurringTransactionOccurrence"("recurringRuleId", "occurrenceMonth");

CREATE INDEX IF NOT EXISTS "RecurringTransactionOccurrence_userId_occurrenceMonth_idx"
ON "RecurringTransactionOccurrence"("userId", "occurrenceMonth");

CREATE INDEX IF NOT EXISTS "RecurringTransactionOccurrence_userId_recurringRuleId_occurrenceMonth_idx"
ON "RecurringTransactionOccurrence"("userId", "recurringRuleId", "occurrenceMonth");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'RecurringTransactionOccurrence_recurringRuleId_fkey'
  ) THEN
    ALTER TABLE "RecurringTransactionOccurrence"
    ADD CONSTRAINT "RecurringTransactionOccurrence_recurringRuleId_fkey"
    FOREIGN KEY ("recurringRuleId") REFERENCES "RecurringTransactionRule"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
