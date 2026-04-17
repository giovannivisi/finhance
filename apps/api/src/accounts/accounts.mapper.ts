import type { Account } from '@prisma/client';
import type { AccountResponse } from '@finhance/shared';

export function toAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution,
    notes: account.notes,
    order: account.order,
    archivedAt: account.archivedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}
