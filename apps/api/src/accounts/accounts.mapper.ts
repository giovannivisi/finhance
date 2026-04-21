import { Prisma } from '@prisma/client';
import type {
  AccountReconciliationResponse,
  AccountResponse,
} from '@finhance/shared';
import type { AccountReconciliationModel } from '@accounts/accounts.service';

import type { Account } from '@prisma/client';

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value?.toNumber() ?? null;
}

export function toAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    currency: account.currency,
    institution: account.institution,
    notes: account.notes,
    order: account.order,
    openingBalance: account.openingBalance.toNumber(),
    openingBalanceDate:
      account.openingBalanceDate?.toISOString().slice(0, 10) ?? null,
    archivedAt: account.archivedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function toAccountReconciliationResponse(
  model: AccountReconciliationModel,
): AccountReconciliationResponse {
  return {
    status: model.status,
    accountId: model.account.id,
    accountName: model.account.name,
    accountType: model.account.type,
    currency: model.account.currency,
    trackedBalance: decimalToNumber(model.trackedBalance),
    expectedBalance: decimalToNumber(model.expectedBalance),
    delta: decimalToNumber(model.delta),
    assetCount: model.assetCount,
    transactionCount: model.transactionCount,
    issueCodes: model.issueCodes,
    canCreateAdjustment: model.canCreateAdjustment,
  };
}
