-- Drop the pre-hierarchy uniqueness rule that blocked duplicate expense
-- secondary names across different primaries.
DROP INDEX IF EXISTS "Category_userId_type_active_name_key";

-- Rebuild active category uniqueness by hierarchy group so income categories
-- and expense primaries stay unique at the root, while expense secondaries are
-- unique only within their parent category.
CREATE UNIQUE INDEX "Category_userId_type_parent_category_id_active_name_key"
ON "Category"(
  "userId",
  "type",
  COALESCE("parent_category_id", ''),
  LOWER("name")
)
WHERE "archivedAt" IS NULL;
