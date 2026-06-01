/*
  Warnings:

  - The values [ETF] on the enum `AssetKind` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AssetKind_new" AS ENUM ('CASH', 'STOCK', 'BOND', 'CRYPTO', 'REAL_ESTATE', 'PENSION', 'COMMODITY', 'OTHER');
ALTER TABLE "public"."Asset" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "Asset" ALTER COLUMN "kind" TYPE "AssetKind_new" USING ("kind"::text::"AssetKind_new");
ALTER TYPE "AssetKind" RENAME TO "AssetKind_old";
ALTER TYPE "AssetKind_new" RENAME TO "AssetKind";
DROP TYPE "public"."AssetKind_old";
ALTER TABLE "Asset" ALTER COLUMN "kind" SET DEFAULT 'CASH';
COMMIT;
