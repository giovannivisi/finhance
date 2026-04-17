ALTER TABLE "PortfolioState"
RENAME COLUMN "lastRefreshRequestedAt" TO "lastRefreshSucceededAt";

ALTER TABLE "PortfolioState"
ADD COLUMN "refreshStartedAt" TIMESTAMP(3);
