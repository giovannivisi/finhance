/*
  Warnings:

  - You are about to drop the `AssetLot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AssetLot" DROP CONSTRAINT "AssetLot_assetId_fkey";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "quantity" DECIMAL(20,10),
ADD COLUMN     "unitPrice" DECIMAL(20,10);

-- DropTable
DROP TABLE "AssetLot";
