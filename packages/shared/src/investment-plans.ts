import type { AssetKind } from "#assets";
import type { BrokerageOperationResponse } from "#brokerage";

export type InvestmentPlanCadence = "MONTHLY" | "TWICE_MONTHLY";
export type InvestmentPlanOccurrenceStatus = "COMPLETED" | "SKIPPED";

export interface InvestmentPlanAccountResponse {
  id: string;
  name: string;
  currency: string;
}

export interface InvestmentPlanResponse {
  id: string;
  account: InvestmentPlanAccountResponse;
  name: string;
  securityName: string;
  securityKind: AssetKind;
  securityTicker: string;
  securityExchange: string | null;
  currency: string;
  contributionAmount: number;
  estimatedFeeAmount: number | null;
  cadence: InvestmentPlanCadence;
  dayOfMonth: number;
  secondDayOfMonth: number | null;
  nextScheduledDate: string;
  isActive: boolean;
  isDue: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInvestmentPlanRequest {
  accountId: string;
  name: string;
  securityName: string;
  securityKind: AssetKind;
  securityTicker: string;
  securityExchange?: string | null;
  currency: string;
  contributionAmount: number;
  estimatedFeeAmount?: number | null;
  cadence: InvestmentPlanCadence;
  dayOfMonth: number;
  secondDayOfMonth?: number | null;
  nextScheduledDate: string;
  notes?: string | null;
}

export type UpdateInvestmentPlanRequest = CreateInvestmentPlanRequest;

export interface RecordInvestmentPlanBuyRequest {
  quantity: number;
  unitPrice: number;
  feeAmount?: number | null;
  postedAt: string;
  notes?: string | null;
}

export interface RecordInvestmentPlanBuyResponse {
  plan: InvestmentPlanResponse;
  operation: BrokerageOperationResponse;
}
