import { Prisma } from '@finhance/db';
import type { InvestmentPlanResponse } from '@finhance/shared';

const ROME_DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface InvestmentPlanResponseModel {
  id: string;
  name: string;
  securityName: string;
  securityKind: InvestmentPlanResponse['securityKind'];
  securityTicker: string;
  securityExchange: string | null;
  currency: string;
  contributionAmount: Prisma.Decimal;
  estimatedFeeAmount: Prisma.Decimal | null;
  cadence: InvestmentPlanResponse['cadence'];
  dayOfMonth: number;
  secondDayOfMonth: number | null;
  nextScheduledDate: Date;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  account: {
    id: string;
    name: string;
    currency: string;
  };
}

function toDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function currentRomeDateKey(now: Date): string {
  const parts = ROME_DATE_FORMATTER.formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get('year')}-${values.get('month')}-${values.get('day')}`;
}

export function toInvestmentPlanResponse(
  plan: InvestmentPlanResponseModel,
  now = new Date(),
): InvestmentPlanResponse {
  const nextScheduledDate = toDateKey(plan.nextScheduledDate);

  return {
    id: plan.id,
    account: plan.account,
    name: plan.name,
    securityName: plan.securityName,
    securityKind: plan.securityKind,
    securityTicker: plan.securityTicker,
    securityExchange: plan.securityExchange,
    currency: plan.currency,
    contributionAmount: plan.contributionAmount.toNumber(),
    estimatedFeeAmount: plan.estimatedFeeAmount?.toNumber() ?? null,
    cadence: plan.cadence,
    dayOfMonth: plan.dayOfMonth,
    secondDayOfMonth: plan.secondDayOfMonth,
    nextScheduledDate,
    isActive: plan.isActive,
    isDue: plan.isActive && nextScheduledDate <= currentRomeDateKey(now),
    notes: plan.notes,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}
