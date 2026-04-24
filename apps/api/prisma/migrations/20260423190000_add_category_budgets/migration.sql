-- CreateTable
CREATE TABLE "CategoryBudget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(20,10) NOT NULL,
    "startMonth" DATE NOT NULL,
    "endMonth" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryBudgetOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryBudgetId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(20,10) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryBudgetOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudget_userId_categoryId_currency_startMonth_key" ON "CategoryBudget"("userId", "categoryId", "currency", "startMonth");

-- CreateIndex
CREATE INDEX "CategoryBudget_userId_startMonth_endMonth_idx" ON "CategoryBudget"("userId", "startMonth", "endMonth");

-- CreateIndex
CREATE INDEX "CategoryBudget_userId_categoryId_currency_startMonth_endMo_idx" ON "CategoryBudget"("userId", "categoryId", "currency", "startMonth", "endMonth");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryBudgetOverride_categoryBudgetId_month_key" ON "CategoryBudgetOverride"("categoryBudgetId", "month");

-- CreateIndex
CREATE INDEX "CategoryBudgetOverride_userId_month_idx" ON "CategoryBudgetOverride"("userId", "month");

-- CreateIndex
CREATE INDEX "CategoryBudgetOverride_userId_categoryBudgetId_month_idx" ON "CategoryBudgetOverride"("userId", "categoryBudgetId", "month");

-- AddForeignKey
ALTER TABLE "CategoryBudget" ADD CONSTRAINT "CategoryBudget_categoryId_userId_fkey" FOREIGN KEY ("categoryId", "userId") REFERENCES "Category"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryBudgetOverride" ADD CONSTRAINT "CategoryBudgetOverride_categoryBudgetId_fkey" FOREIGN KEY ("categoryBudgetId") REFERENCES "CategoryBudget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
