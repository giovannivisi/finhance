-- CreateEnum
CREATE TYPE "LiabilityKind" AS ENUM ('TAX', 'DEBT', 'OTHER');

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "liabilityKind" "LiabilityKind",
ALTER COLUMN "kind" DROP NOT NULL,
ALTER COLUMN "kind" DROP DEFAULT;
