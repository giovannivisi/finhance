/*
  Warnings:

  - You are about to drop the column `quantity` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `Asset` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "quantity",
DROP COLUMN "unitPrice";

-- CreateTable
CREATE TABLE "AssetLot" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "quantity" DECIMAL(20,10) NOT NULL,
    "unitPrice" DECIMAL(20,10) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetLot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AssetLot" ADD CONSTRAINT "AssetLot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
