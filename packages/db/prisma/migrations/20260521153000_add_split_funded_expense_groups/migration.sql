ALTER TABLE "Transaction"
ADD COLUMN "splitGroupId" TEXT;

CREATE INDEX "Transaction_userId_splitGroupId_idx"
ON "Transaction"("userId", "splitGroupId");
