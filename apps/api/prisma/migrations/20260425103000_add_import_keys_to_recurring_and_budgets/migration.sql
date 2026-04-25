-- AlterTable
ALTER TABLE "CategoryBudget"
ADD COLUMN "importSource" "ImportSource",
ADD COLUMN "importKey" TEXT;

-- AlterTable
ALTER TABLE "RecurringTransactionRule"
ADD COLUMN "importSource" "ImportSource",
ADD COLUMN "importKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_importSource_importKey_key"
ON "CategoryBudget"("userId", "importSource", "importKey");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringTransactionRule_userId_importSource_importKey_key"
ON "RecurringTransactionRule"("userId", "importSource", "importKey");
