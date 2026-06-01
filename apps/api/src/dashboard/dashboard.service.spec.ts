import { DashboardService } from '@/dashboard/dashboard.service';
import type { DashboardResponse, SetupStatusResponse } from '@finhance/shared';
import { Prisma } from '@finhance/db';

const OWNER_ID = 'local-dev';

function createDashboard(
  overrides: Partial<DashboardResponse> = {},
): DashboardResponse {
  return {
    reportingCurrency: 'EUR',
    baseCurrency: 'EUR',
    assets: [
      {
        id: 'asset-1',
        name: 'Cash',
        type: 'ASSET',
        accountId: null,
        accountName: null,
        accountType: null,
        kind: 'CASH',
        liabilityKind: null,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance: 100,
        currency: 'EUR',
        notes: null,
        order: 0,
        lastPrice: null,
        lastPriceAt: null,
        lastFxRate: null,
        lastFxRateAt: null,
        currentValue: 100,
        referenceValue: 100,
        valuationSource: 'DIRECT_BALANCE',
        valuationAsOf: '2026-04-17T10:00:00.000Z',
        isStale: false,
      },
    ],
    summary: {
      assets: 100,
      liabilities: 25,
      netWorth: 75,
    },
    pricingStatus: {
      state: 'FRESH',
      refreshSuggested: false,
      hasStaleQuotes: false,
      hasStaleFx: false,
      hasMissingFx: false,
    },
    assetKindOrder: [],
    lastRefreshAt: '2026-04-17T10:00:00.000Z',
    latestSnapshotDate: null,
    latestSnapshotCapturedAt: null,
    latestSnapshotIsPartial: null,
    ...overrides,
  };
}

describe('DashboardService', () => {
  let service: DashboardService;
  let accounts: {
    findAll: jest.Mock;
  };
  let assets: {
    getDashboard: jest.Mock;
  };
  let budgets: {
    findMonthly: jest.Mock;
  };
  let setup: {
    getStatus: jest.Mock;
  };

  beforeEach(() => {
    accounts = {
      findAll: jest.fn(),
    };
    assets = {
      getDashboard: jest.fn(),
    };
    budgets = {
      findMonthly: jest.fn(),
    };
    setup = {
      getStatus: jest.fn(),
    };

    service = new DashboardService(
      accounts as never,
      assets as never,
      budgets as never,
      setup as never,
    );
  });

  it('keeps snapshot metadata out of the dashboard critical path', async () => {
    const dashboard = createDashboard();
    assets.getDashboard.mockResolvedValue(dashboard);

    const result = await service.getDashboard(OWNER_ID);

    expect(result.latestSnapshotDate).toBeNull();
    expect(result.latestSnapshotCapturedAt).toBeNull();
    expect(result.latestSnapshotIsPartial).toBeNull();
  });

  it('returns combined dashboard page data in one service call', async () => {
    const dashboard = createDashboard();
    const account = {
      id: 'acct-1',
      name: 'Broker',
      type: 'BROKER',
      currency: 'EUR',
      institution: null,
      notes: null,
      order: 0,
      openingBalance: new Prisma.Decimal('0'),
      openingBalanceDate: null,
      archivedAt: null,
      createdAt: new Date('2026-04-17T10:00:00.000Z'),
      updatedAt: new Date('2026-04-17T10:00:00.000Z'),
    };
    const budgetView = {
      month: '2026-04',
      currencies: [],
    };
    const setupStatus: SetupStatusResponse = {
      isComplete: true,
      currentMonth: '2026-04',
      requiredCompletedCount: 3,
      requiredTotalCount: 3,
      requiredSteps: [],
      recommendedSteps: [],
      warnings: [],
      handoff: [],
      activeAccountCount: 1,
      activeIncomeCategoryCount: 1,
      activeExpenseCategoryCount: 1,
      activeRecurringRuleCount: 0,
      currentMonthBudgetCount: 0,
      hasAppliedImportBatch: false,
      hasSnapshot: false,
      hasReportingCurrencyConfigured: true,
    };

    jest.spyOn(service, 'getDashboard').mockResolvedValue(dashboard);
    accounts.findAll.mockResolvedValue([account]);
    budgets.findMonthly.mockResolvedValue(budgetView);
    setup.getStatus.mockResolvedValue(setupStatus);

    const result = await service.getPageData(OWNER_ID);

    expect(result).toEqual({
      dashboard,
      budgetView,
      accounts: [
        expect.objectContaining({
          id: 'acct-1',
          type: 'BROKER',
          currency: 'EUR',
        }),
      ],
      setup: setupStatus,
    });
  });
});
