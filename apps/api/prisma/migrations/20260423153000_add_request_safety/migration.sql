-- CreateEnum
CREATE TYPE "IdempotencyRequestStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OperationType" AS ENUM ('ASSET_REFRESH', 'SNAPSHOT_CAPTURE', 'RECURRING_MATERIALIZE');

-- CreateTable
CREATE TABLE "IdempotencyRequest" (
    "userId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "routePath" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "status" "IdempotencyRequestStatus" NOT NULL,
    "responseStatusCode" INTEGER,
    "responseJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyRequest_pkey" PRIMARY KEY ("userId","method","routePath","idempotencyKey")
);

-- CreateTable
CREATE TABLE "OperationState" (
    "userId" TEXT NOT NULL,
    "type" "OperationType" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationState_pkey" PRIMARY KEY ("userId","type")
);

-- CreateIndex
CREATE INDEX "IdempotencyRequest_userId_createdAt_idx" ON "IdempotencyRequest"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OperationState_userId_updatedAt_idx" ON "OperationState"("userId", "updatedAt" DESC);
