import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  AssetKind,
  InvestmentPlanCadence,
  InvestmentPlanOccurrenceStatus,
  Prisma,
} from '@finhance/db';
import { BrokerageService } from '@brokerage/brokerage.service';
import { InvestmentPlansService } from '@investment-plans/investment-plans.service';
import { PrismaService } from '@prisma/prisma.service';

const OWNER_ID = 'local-dev';
const NOW = new Date('2026-08-05T10:00:00.000Z');

function expectObjectContaining<T extends object>(value: Partial<T>): T {
  return expect.objectContaining(value) as T;
}

function createPlan(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'plan-1',
    userId: OWNER_ID,
    accountId: 'broker-1',
    name: 'VWCE savings plan',
    securityName: 'Vanguard FTSE All-World',
    securityKind: AssetKind.STOCK,
    securityTicker: 'VWCE',
    securityExchange: '.DE',
    currency: 'EUR',
    contributionAmount: new Prisma.Decimal('250'),
    estimatedFeeAmount: new Prisma.Decimal('1'),
    cadence: InvestmentPlanCadence.TWICE_MONTHLY,
    dayOfMonth: 1,
    secondDayOfMonth: 15,
    nextScheduledDate: new Date('2026-08-01T12:00:00.000Z'),
    isActive: true,
    notes: 'Keep investing through volatility.',
    createdAt: NOW,
    updatedAt: NOW,
    account: {
      id: 'broker-1',
      name: 'Broker',
      currency: 'EUR',
    },
    ...overrides,
  };
}

function createOperation() {
  return {
    id: 'operation-1',
    kind: 'BUY' as const,
    accountId: 'broker-1',
    assetId: 'asset-1',
    postedAt: '2026-08-05T09:00:00.000Z',
    currency: 'EUR',
    quantity: 2.5,
    unitPrice: 100,
    grossAmount: 250,
    feeAmount: 1,
    cashAmount: -251,
    realisedGainLoss: null,
    notes: null,
    mirroredTransactionId: null,
  };
}

describe('InvestmentPlansService', () => {
  let service: InvestmentPlansService;
  let prisma: {
    $transaction: jest.Mock;
    account: { findFirst: jest.Mock };
    investmentPlan: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    investmentPlanOccurrence: { create: jest.Mock };
  };
  let brokerage: { createBuyInTransaction: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
    prisma = {
      $transaction: jest.fn(),
      account: { findFirst: jest.fn().mockResolvedValue({ id: 'broker-1' }) },
      investmentPlan: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(createPlan()),
        create: jest.fn().mockResolvedValue(createPlan()),
        update: jest.fn().mockResolvedValue(createPlan()),
      },
      investmentPlanOccurrence: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(
      (work: (client: typeof prisma) => unknown) => work(prisma),
    );
    brokerage = {
      createBuyInTransaction: jest.fn().mockResolvedValue(createOperation()),
    };
    service = new InvestmentPlansService(
      prisma as unknown as PrismaService,
      brokerage as unknown as BrokerageService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a twice-monthly plan with a normalised security target', async () => {
    await service.create(OWNER_ID, {
      accountId: 'broker-1',
      name: '  VWCE savings plan  ',
      securityName: '  Vanguard FTSE All-World  ',
      securityKind: AssetKind.STOCK,
      securityTicker: 'vwce',
      securityExchange: '.de',
      currency: 'eur',
      contributionAmount: 250,
      estimatedFeeAmount: 1,
      cadence: InvestmentPlanCadence.TWICE_MONTHLY,
      dayOfMonth: 1,
      secondDayOfMonth: 15,
      nextScheduledDate: '2026-08-15',
      notes: '  Keep investing.  ',
    });

    expect(prisma.investmentPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectObjectContaining<Prisma.InvestmentPlanUncheckedCreateInput>(
          {
            userId: OWNER_ID,
            name: 'VWCE savings plan',
            securityName: 'Vanguard FTSE All-World',
            securityTicker: 'VWCE',
            securityExchange: '.DE',
            currency: 'EUR',
            nextScheduledDate: new Date('2026-08-15T12:00:00.000Z'),
            notes: 'Keep investing.',
          },
        ),
      }),
    );
  });

  it('supports a one-off delayed date before returning to the normal cadence', async () => {
    const delayedPlan = createPlan({
      cadence: InvestmentPlanCadence.MONTHLY,
      dayOfMonth: 1,
      secondDayOfMonth: null,
      nextScheduledDate: new Date('2026-08-10T12:00:00.000Z'),
    });
    prisma.investmentPlan.findFirst.mockResolvedValue(delayedPlan);
    prisma.investmentPlan.update.mockResolvedValue(
      createPlan({
        cadence: InvestmentPlanCadence.MONTHLY,
        dayOfMonth: 1,
        secondDayOfMonth: null,
        nextScheduledDate: new Date('2026-09-01T12:00:00.000Z'),
      }),
    );

    await service.create(OWNER_ID, {
      accountId: 'broker-1',
      name: 'VWCE savings plan',
      securityName: 'Vanguard FTSE All-World',
      securityKind: AssetKind.STOCK,
      securityTicker: 'VWCE',
      securityExchange: '.DE',
      currency: 'EUR',
      contributionAmount: 250,
      cadence: InvestmentPlanCadence.MONTHLY,
      dayOfMonth: 1,
      nextScheduledDate: '2026-08-10',
    });

    expect(prisma.investmentPlan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expectObjectContaining<Prisma.InvestmentPlanUncheckedCreateInput>(
          {
            nextScheduledDate: new Date('2026-08-10T12:00:00.000Z'),
          },
        ),
      }),
    );

    jest.setSystemTime(new Date('2026-08-10T10:00:00.000Z'));
    await service.recordBuy(OWNER_ID, 'plan-1', {
      quantity: 2.5,
      unitPrice: 100,
      postedAt: '2026-08-10T09:00:00.000Z',
    });

    expect(prisma.investmentPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextScheduledDate: new Date('2026-09-01T12:00:00.000Z') },
      }),
    );
  });

  it('rejects invalid twice-monthly days before persisting a plan', async () => {
    await expect(
      service.create(OWNER_ID, {
        accountId: 'broker-1',
        name: 'VWCE savings plan',
        securityName: 'Vanguard FTSE All-World',
        securityKind: AssetKind.STOCK,
        securityTicker: 'VWCE',
        securityExchange: '.DE',
        currency: 'EUR',
        contributionAmount: 250,
        cadence: InvestmentPlanCadence.TWICE_MONTHLY,
        dayOfMonth: 15,
        secondDayOfMonth: 15,
        nextScheduledDate: '2026-08-15',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.investmentPlan.create).not.toHaveBeenCalled();
  });

  it('records a skipped due instalment without creating a brokerage buy', async () => {
    const advancedPlan = createPlan({
      nextScheduledDate: new Date('2026-08-15T12:00:00.000Z'),
    });
    prisma.investmentPlan.update.mockResolvedValue(advancedPlan);

    await service.skip(OWNER_ID, 'plan-1');

    expect(prisma.investmentPlanOccurrence.create).toHaveBeenCalledWith({
      data: expectObjectContaining<Prisma.InvestmentPlanOccurrenceUncheckedCreateInput>(
        {
          userId: OWNER_ID,
          investmentPlanId: 'plan-1',
          scheduledFor: new Date('2026-08-01T12:00:00.000Z'),
          status: InvestmentPlanOccurrenceStatus.SKIPPED,
        },
      ),
    });
    expect(prisma.investmentPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { nextScheduledDate: new Date('2026-08-15T12:00:00.000Z') },
      }),
    );
    expect(brokerage.createBuyInTransaction).not.toHaveBeenCalled();
  });

  it('creates a real buy only when the due instalment is confirmed', async () => {
    const advancedPlan = createPlan({
      nextScheduledDate: new Date('2026-08-15T12:00:00.000Z'),
    });
    prisma.investmentPlan.update.mockResolvedValue(advancedPlan);

    const result = await service.recordBuy(OWNER_ID, 'plan-1', {
      quantity: 2.5,
      unitPrice: 100,
      feeAmount: 1,
      postedAt: '2026-08-05T09:00:00.000Z',
      notes: 'Executed after the market opened.',
    });

    expect(brokerage.createBuyInTransaction).toHaveBeenCalledWith(
      OWNER_ID,
      'broker-1',
      {
        name: 'Vanguard FTSE All-World',
        kind: AssetKind.STOCK,
        ticker: 'VWCE',
        exchange: '.DE',
        currency: 'EUR',
        quantity: 2.5,
        unitPrice: 100,
        feeAmount: 1,
        postedAt: '2026-08-05T09:00:00.000Z',
        notes: 'Executed after the market opened.',
      },
      prisma,
    );
    expect(prisma.investmentPlanOccurrence.create).toHaveBeenCalledWith({
      data: expectObjectContaining<Prisma.InvestmentPlanOccurrenceUncheckedCreateInput>(
        {
          status: InvestmentPlanOccurrenceStatus.COMPLETED,
          brokerageOperationId: 'operation-1',
        },
      ),
    });
    expect(result.operation).toEqual(createOperation());
  });

  it('does not create a buy before a plan is due', async () => {
    prisma.investmentPlan.findFirst.mockResolvedValue(
      createPlan({
        nextScheduledDate: new Date('2026-08-15T12:00:00.000Z'),
      }),
    );

    await expect(
      service.recordBuy(OWNER_ID, 'plan-1', {
        quantity: 2.5,
        unitPrice: 100,
        postedAt: '2026-08-05T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(brokerage.createBuyInTransaction).not.toHaveBeenCalled();
  });

  it('does not advance a paused due plan', async () => {
    prisma.investmentPlan.findFirst.mockResolvedValue(
      createPlan({ isActive: false }),
    );

    await expect(service.skip(OWNER_ID, 'plan-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(prisma.investmentPlanOccurrence.create).not.toHaveBeenCalled();
  });
});
