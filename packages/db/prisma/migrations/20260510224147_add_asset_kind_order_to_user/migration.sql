-- DropIndex
DROP INDEX "Category_userId_type_archivedAt_order_createdAt_idx";

-- RenameIndex
ALTER INDEX "Category_userId_type_parent_category_id_archivedAt_order_create" RENAME TO "Category_userId_type_parent_category_id_archivedAt_order_cr_idx";
