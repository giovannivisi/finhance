-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('CASH', 'STOCK', 'ETF', 'BOND', 'CRYPTO', 'REAL_ESTATE', 'PENSION', 'COMMODITY', 'OTHER');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "kind" "AssetKind" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "order" INTEGER DEFAULT 0,
ADD COLUMN     "quantity" DECIMAL(20,10),
ADD COLUMN     "ticker" TEXT,
ADD COLUMN     "unitPrice" DECIMAL(20,10);
