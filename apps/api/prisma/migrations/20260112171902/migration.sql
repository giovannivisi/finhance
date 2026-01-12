/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Asset` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_categoryId_fkey";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "categoryId";

-- DropTable
DROP TABLE "Category";
