ALTER TABLE "Asset"
ADD COLUMN IF NOT EXISTS "importSource" "ImportSource",
ADD COLUMN IF NOT EXISTS "importKey" TEXT;

ALTER TABLE "Account"
ADD COLUMN IF NOT EXISTS "importSource" "ImportSource",
ADD COLUMN IF NOT EXISTS "importKey" TEXT;

ALTER TABLE "Category"
ADD COLUMN IF NOT EXISTS "importSource" "ImportSource",
ADD COLUMN IF NOT EXISTS "importKey" TEXT;

ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "importSource" "ImportSource",
ADD COLUMN IF NOT EXISTS "importKey" TEXT;

CREATE TABLE IF NOT EXISTS "ImportBatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "status" "ImportBatchStatus" NOT NULL,
    "summaryJson" JSONB NOT NULL,
    "payloadJson" JSONB,
    "errorJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Asset_userId_importSource_importKey_key"
ON "Asset"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX IF NOT EXISTS "Account_userId_importSource_importKey_key"
ON "Account"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX IF NOT EXISTS "Category_userId_importSource_importKey_key"
ON "Category"("userId", "importSource", "importKey");

CREATE UNIQUE INDEX IF NOT EXISTS "Transaction_userId_importSource_importKey_direction_key"
ON "Transaction"("userId", "importSource", "importKey", "direction");

CREATE INDEX IF NOT EXISTS "ImportBatch_userId_createdAt_idx"
ON "ImportBatch"("userId", "createdAt" DESC);
