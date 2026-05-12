WITH owner_ids AS (
    SELECT "userId" AS user_id FROM "Asset"
    UNION
    SELECT "userId" AS user_id FROM "Account"
    UNION
    SELECT "userId" AS user_id FROM "Category"
    UNION
    SELECT "userId" AS user_id FROM "ExpenseValidationRule"
    UNION
    SELECT "userId" AS user_id FROM "CategoryBudget"
    UNION
    SELECT "userId" AS user_id FROM "CategoryBudgetOverride"
    UNION
    SELECT "userId" AS user_id FROM "PortfolioState"
    UNION
    SELECT "userId" AS user_id FROM "IdempotencyRequest"
    UNION
    SELECT "userId" AS user_id FROM "OperationState"
    UNION
    SELECT "userId" AS user_id FROM "NetWorthSnapshot"
    UNION
    SELECT "userId" AS user_id FROM "Transaction"
    UNION
    SELECT "userId" AS user_id FROM "RecurringTransactionRule"
    UNION
    SELECT "userId" AS user_id FROM "RecurringTransactionOccurrence"
    UNION
    SELECT "userId" AS user_id FROM "ImportBatch"
)
INSERT INTO "users" ("id", "email", "updated_at")
SELECT owner_ids.user_id,
       'finhance-user+' || owner_ids.user_id || '@placeholder.local',
       CURRENT_TIMESTAMP
FROM owner_ids
LEFT JOIN "users" existing_user ON existing_user."id" = owner_ids.user_id
WHERE owner_ids.user_id IS NOT NULL
  AND existing_user."id" IS NULL;

ALTER TABLE "Asset"
    ADD CONSTRAINT "Asset_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Account"
    ADD CONSTRAINT "Account_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Category"
    ADD CONSTRAINT "Category_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ExpenseValidationRule"
    ADD CONSTRAINT "ExpenseValidationRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryBudget"
    ADD CONSTRAINT "CategoryBudget_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CategoryBudgetOverride"
    ADD CONSTRAINT "CategoryBudgetOverride_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PortfolioState"
    ADD CONSTRAINT "PortfolioState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdempotencyRequest"
    ADD CONSTRAINT "IdempotencyRequest_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OperationState"
    ADD CONSTRAINT "OperationState_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "NetWorthSnapshot"
    ADD CONSTRAINT "NetWorthSnapshot_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecurringTransactionRule"
    ADD CONSTRAINT "RecurringTransactionRule_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "RecurringTransactionOccurrence"
    ADD CONSTRAINT "RecurringTransactionOccurrence_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ImportBatch"
    ADD CONSTRAINT "ImportBatch_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
