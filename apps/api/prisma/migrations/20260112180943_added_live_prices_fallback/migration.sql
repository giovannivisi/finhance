-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "lastPrice" DECIMAL(14,6),
ADD COLUMN     "lastPriceAt" TIMESTAMP(3);
