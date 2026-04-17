CREATE TYPE "CategoryType" AS ENUM ('EXPENSE', 'INCOME');

CREATE TYPE "TransactionKind" AS ENUM (
    'EXPENSE',
    'INCOME',
    'TRANSFER',
    'ADJUSTMENT'
);

CREATE TYPE "TransactionDirection" AS ENUM ('INFLOW', 'OUTFLOW');

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" DECIMAL(20,10) NOT NULL,
    "currency" TEXT NOT NULL,
    "direction" "TransactionDirection" NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "counterparty" TEXT,
    "transferGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Category_id_userId_key" ON "Category"("id", "userId");
CREATE UNIQUE INDEX "Category_userId_type_active_name_key"
    ON "Category"("userId", "type", LOWER("name"))
    WHERE "archivedAt" IS NULL;

CREATE INDEX "Category_userId_type_archivedAt_order_createdAt_idx"
    ON "Category"("userId", "type", "archivedAt", "order", "createdAt");
CREATE INDEX "Transaction_userId_postedAt_idx"
    ON "Transaction"("userId", "postedAt");
CREATE INDEX "Transaction_userId_kind_postedAt_idx"
    ON "Transaction"("userId", "kind", "postedAt");
CREATE INDEX "Transaction_userId_accountId_postedAt_idx"
    ON "Transaction"("userId", "accountId", "postedAt");
CREATE INDEX "Transaction_userId_categoryId_postedAt_idx"
    ON "Transaction"("userId", "categoryId", "postedAt");
CREATE INDEX "Transaction_userId_transferGroupId_idx"
    ON "Transaction"("userId", "transferGroupId");

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_amount_positive_check"
    CHECK ("amount" > 0);

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_kind_direction_check"
    CHECK (
        ("kind" = 'EXPENSE' AND "direction" = 'OUTFLOW')
        OR ("kind" = 'INCOME' AND "direction" = 'INFLOW')
        OR ("kind" = 'ADJUSTMENT' AND "direction" IN ('INFLOW', 'OUTFLOW'))
        OR ("kind" = 'TRANSFER' AND "direction" IN ('INFLOW', 'OUTFLOW'))
    );

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_transfer_group_check"
    CHECK (
        ("kind" = 'TRANSFER' AND "transferGroupId" IS NOT NULL)
        OR ("kind" <> 'TRANSFER' AND "transferGroupId" IS NULL)
    );

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_transfer_category_check"
    CHECK ("kind" <> 'TRANSFER' OR "categoryId" IS NULL);

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_accountId_userId_fkey"
    FOREIGN KEY ("accountId", "userId")
    REFERENCES "Account"("id", "userId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_categoryId_userId_fkey"
    FOREIGN KEY ("categoryId", "userId")
    REFERENCES "Category"("id", "userId")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;
