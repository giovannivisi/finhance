import { SetupService } from '@/setup/setup.service';

const OWNER_ID = 'local-dev';

describe('SetupService', () => {
  let service: SetupService;
  let prisma: {
    account: { count: jest.Mock };
    category: { findMany: jest.Mock };
    recurringTransactionRule: { count: jest.Mock };
    categoryBudget: { count: jest.Mock };
    importBatch: { count: jest.Mock };
    netWorthSnapshot: { findFirst: jest.Mock };
  };
  let accounts: {
    findReconciliation: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      account: { count: jest.fn().mockResolvedValue(0) },
      category: { findMany: jest.fn().mockResolvedValue([]) },
      recurringTransactionRule: { count: jest.fn().mockResolvedValue(0) },
      categoryBudget: { count: jest.fn().mockResolvedValue(0) },
      importBatch: { count: jest.fn().mockResolvedValue(0) },
      netWorthSnapshot: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    accounts = {
      findReconciliation: jest.fn().mockResolvedValue([]),
    };

    service = new SetupService(prisma as never, accounts as never);
  });

  it('returns an incomplete trust baseline until accounts and both category types exist', async () => {
    prisma.account.count.mockResolvedValue(1);
    prisma.category.findMany.mockResolvedValue([{ type: 'EXPENSE' }]);

    const result = await service.getStatus(OWNER_ID);

    expect(result.isComplete).toBe(false);
    expect(result.requiredCompletedCount).toBe(1);
    expect(
      result.requiredSteps.map((step) => [step.code, step.status]),
    ).toEqual([
      ['ACCOUNTS', 'COMPLETE'],
      ['CATEGORIES', 'INCOMPLETE'],
    ]);
    expect(result.warnings.map((warning) => warning.code)).toContain(
      'NO_SNAPSHOT_YET',
    );
  });

  it('returns a complete baseline with handoff links once the required setup exists', async () => {
    prisma.account.count.mockResolvedValue(2);
    prisma.category.findMany.mockResolvedValue([
      { type: 'INCOME' },
      { type: 'EXPENSE' },
    ]);
    prisma.recurringTransactionRule.count.mockResolvedValue(1);
    prisma.categoryBudget.count.mockResolvedValue(2);
    prisma.importBatch.count.mockResolvedValue(1);
    prisma.netWorthSnapshot.findFirst.mockResolvedValue({
      id: 'snapshot-1',
    });
    accounts.findReconciliation.mockResolvedValue([
      {
        account: { id: 'account-1', name: 'Checking' },
        status: 'CLEAN',
        diagnostics: [],
      },
    ]);

    const result = await service.getStatus(OWNER_ID);

    expect(result.isComplete).toBe(true);
    expect(result.requiredCompletedCount).toBe(2);
    expect(result.hasAppliedImportBatch).toBe(true);
    expect(result.hasSnapshot).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.handoff.map((item) => item.code)).toEqual([
      'REVIEW',
      'ANALYTICS',
      'HISTORY',
    ]);
  });

  it('surfaces baseline-missing and reconciliation warnings without blocking completion', async () => {
    prisma.account.count.mockResolvedValue(1);
    prisma.category.findMany.mockResolvedValue([
      { type: 'INCOME' },
      { type: 'EXPENSE' },
    ]);
    accounts.findReconciliation.mockResolvedValue([
      {
        account: { id: 'account-1', name: 'Checking' },
        status: 'MISMATCH',
        diagnostics: [
          { code: 'BASELINE_MISSING' },
          { code: 'BASELINE_POSSIBLY_STALE' },
        ],
      },
    ]);

    const result = await service.getStatus(OWNER_ID);

    expect(result.isComplete).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'BASELINE_MISSING',
      'RECONCILIATION_ISSUES',
      'NO_SNAPSHOT_YET',
    ]);
  });

  it('skips reconciliation work when warnings are excluded', async () => {
    prisma.account.count.mockResolvedValue(1);
    prisma.category.findMany.mockResolvedValue([
      { type: 'INCOME' },
      { type: 'EXPENSE' },
    ]);

    const result = await service.getStatus(OWNER_ID, {
      includeWarnings: false,
    });

    expect(result.isComplete).toBe(true);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      'NO_SNAPSHOT_YET',
    ]);
    expect(accounts.findReconciliation).not.toHaveBeenCalled();
  });
});
