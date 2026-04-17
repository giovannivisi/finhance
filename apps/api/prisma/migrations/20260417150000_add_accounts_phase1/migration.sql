-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BANK', 'BROKER', 'CARD', 'CASH', 'LOAN', 'OTHER');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "institution" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN "accountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Account_id_userId_key" ON "Account"("id", "userId");

-- CreateIndex
CREATE INDEX "Account_userId_archivedAt_order_createdAt_idx" ON "Account"("userId", "archivedAt", "order", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_userId_accountId_idx" ON "Asset"("userId", "accountId");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_accountId_userId_fkey" FOREIGN KEY ("accountId", "userId") REFERENCES "Account"("id", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;
