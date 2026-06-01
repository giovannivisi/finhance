CREATE UNIQUE INDEX "Asset_id_userId_key" ON "Asset"("id", "userId");

CREATE UNIQUE INDEX "Transaction_id_userId_key" ON "Transaction"("id", "userId");

CREATE UNIQUE INDEX "BrokerageOperation_mirroredTransactionId_userId_key"
  ON "BrokerageOperation"("mirroredTransactionId", "userId");

ALTER TABLE "BrokerageOperation"
  DROP CONSTRAINT "BrokerageOperation_assetId_fkey";

ALTER TABLE "BrokerageOperation"
  DROP CONSTRAINT "BrokerageOperation_mirroredTransactionId_fkey";

ALTER TABLE "BrokerageOperation"
  ADD CONSTRAINT "BrokerageOperation_assetId_userId_fkey"
  FOREIGN KEY ("assetId", "userId")
  REFERENCES "Asset"("id", "userId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "BrokerageOperation"
  ADD CONSTRAINT "BrokerageOperation_mirroredTransactionId_userId_fkey"
  FOREIGN KEY ("mirroredTransactionId", "userId")
  REFERENCES "Transaction"("id", "userId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
