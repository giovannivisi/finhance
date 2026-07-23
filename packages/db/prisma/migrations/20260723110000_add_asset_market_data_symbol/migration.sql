-- Retains the provider-native route that last returned a usable quote. Existing
-- holdings resolve lazily on their next refresh, so this nullable addition needs
-- neither a table rewrite nor a migration-time backfill.
ALTER TABLE "assets" ADD COLUMN "market_data_symbol" TEXT;
