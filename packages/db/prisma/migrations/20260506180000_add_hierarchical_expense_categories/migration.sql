-- AlterTable
ALTER TABLE "Category"
ADD COLUMN "parent_category_id" TEXT;

-- CreateTable
CREATE TABLE "ExpenseValidationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entry" TEXT NOT NULL,
    "normalized_entry" TEXT NOT NULL,
    "secondary_category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_userId_type_parent_category_id_archivedAt_order_createdAt_idx"
ON "Category"("userId", "type", "parent_category_id", "archivedAt", "order", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseValidationRule_userId_normalized_entry_key"
ON "ExpenseValidationRule"("userId", "normalized_entry");

-- CreateIndex
CREATE INDEX "ExpenseValidationRule_userId_secondary_category_id_idx"
ON "ExpenseValidationRule"("userId", "secondary_category_id");

-- AddForeignKey
ALTER TABLE "Category"
ADD CONSTRAINT "Category_parent_category_id_userId_fkey"
FOREIGN KEY ("parent_category_id", "userId") REFERENCES "Category"("id", "userId")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseValidationRule"
ADD CONSTRAINT "ExpenseValidationRule_secondary_category_id_userId_fkey"
FOREIGN KEY ("secondary_category_id", "userId") REFERENCES "Category"("id", "userId")
ON DELETE CASCADE ON UPDATE CASCADE;
