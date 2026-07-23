-- Retains the provider-native route that last returned a usable quote. Existing
-- holdings resolve lazily on their next refresh, so this nullable addition needs
-- neither a table rewrite nor a migration-time backfill.
ALTER TABLE "Asset" ADD COLUMN "marketDataSymbol" TEXT;
