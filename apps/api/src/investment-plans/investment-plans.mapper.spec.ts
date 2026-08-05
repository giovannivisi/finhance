import { AssetKind, InvestmentPlanCadence, Prisma } from '@finhance/db';
import {
  toInvestmentPlanResponse,
  type InvestmentPlanResponseModel,
} from '@investment-plans/investment-plans.mapper';

function createPlan(
  overrides: Partial<InvestmentPlanResponseModel> = {},
): InvestmentPlanResponseModel {
  return {
    id: 'plan-1',
    name: 'VWCE plan',
    securityName: 'Vanguard FTSE All-World',
    securityKind: AssetKind.STOCK,
    securityTicker: 'VWCE',
    securityExchange: '.DE',
    currency: 'EUR',
    contributionAmount: new Prisma.Decimal('250'),
    estimatedFeeAmount: null,
    cadence: InvestmentPlanCadence.MONTHLY,
    dayOfMonth: 15,
    secondDayOfMonth: null,
    nextScheduledDate: new Date('2026-08-05T12:00:00.000Z'),
    isActive: true,
    notes: null,
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    updatedAt: new Date('2026-08-01T12:00:00.000Z'),
    account: { id: 'broker-1', name: 'Broker', currency: 'EUR' },
    ...overrides,
  };
}

describe('toInvestmentPlanResponse', () => {
  it('marks an active plan due on its scheduled day', () => {
    const response = toInvestmentPlanResponse(
      createPlan(),
      new Date('2026-08-05T10:00:00.000Z'),
    );

    expect(response.isDue).toBe(true);
    expect(response.nextScheduledDate).toBe('2026-08-05');
  });

  it('does not mark a paused plan due', () => {
    const response = toInvestmentPlanResponse(
      createPlan({ isActive: false }),
      new Date('2026-08-06T10:00:00.000Z'),
    );

    expect(response.isDue).toBe(false);
  });
});
