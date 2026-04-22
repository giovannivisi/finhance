CREATE TYPE "ImportSource" AS ENUM ('CSV_TEMPLATE');

CREATE TYPE "ImportBatchStatus" AS ENUM ('PREVIEW', 'APPLIED', 'FAILED');

ALTER TABLE "Account"
    ADD COLUMN "importSource" "ImportSource",
    ADD COLUMN "importKey" TEXT;

ALTER TABLE "Asset"
    ADD COLUMN "importSource" "ImportSource",
    ADD COLUMN "importKey" TEXT;

ALTER TABLE "Category"
    ADD COLUMN "importSource" "ImportSource",
    ADD COLUMN "importKey" TEXT;

ALTER TABLE "Transaction"
    ADD COLUMN "importSource" "ImportSource",
    ADD COLUMN "importKey" TEXT;

CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "errorJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Account_userId_importSource_importKey_key"
ON "Account"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX "Asset_userId_importSource_importKey_key"
ON "Asset"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX "Category_userId_importSource_importKey_key"
ON "Category"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX "Transaction_userId_importSource_importKey_direction_key"
ON "Transaction"("userId", "importSource", "importKey", "direction");

CREATE INDEX "ImportBatch_userId_createdAt_idx"
ON "ImportBatch"("userId", "createdAt" DESC);
