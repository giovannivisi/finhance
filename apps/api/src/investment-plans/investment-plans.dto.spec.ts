import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { AssetKind, InvestmentPlanCadence } from '@finhance/db';
import { CreateInvestmentPlanDto } from '@investment-plans/dto/create-investment-plan.dto';
import { RecordInvestmentPlanBuyDto } from '@investment-plans/dto/record-investment-plan-buy.dto';

function collectConstraintMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collectConstraintMessages(error.children ?? []),
  ]);
}

describe('Investment plan DTO validation', () => {
  it('normalises a valid plan target', () => {
    const dto = plainToInstance(CreateInvestmentPlanDto, {
      accountId: 'broker-1',
      name: '  VWCE plan ',
      securityName: ' Vanguard FTSE All-World ',
      securityKind: AssetKind.STOCK,
      securityTicker: ' vwce ',
      securityExchange: ' .de ',
      currency: ' eur ',
      contributionAmount: 250,
      cadence: InvestmentPlanCadence.MONTHLY,
      dayOfMonth: 15,
      nextScheduledDate: '2026-08-15',
    });

    expect(collectConstraintMessages(validateSync(dto))).toEqual([]);
    expect(dto.securityTicker).toBe('VWCE');
    expect(dto.securityExchange).toBe('.DE');
    expect(dto.currency).toBe('EUR');
  });

  it('rejects invalid financial values and security identifiers', () => {
    const dto = plainToInstance(CreateInvestmentPlanDto, {
      accountId: 'broker-1',
      name: 'VWCE plan',
      securityName: 'Vanguard FTSE All-World',
      securityKind: AssetKind.STOCK,
      securityTicker: 'VWCE!',
      securityExchange: '.DE',
      currency: 'EUR',
      contributionAmount: 0,
      estimatedFeeAmount: -1,
      cadence: InvestmentPlanCadence.MONTHLY,
      dayOfMonth: 15,
      nextScheduledDate: '2026-08-15',
    });

    expect(collectConstraintMessages(validateSync(dto))).toEqual(
      expect.arrayContaining([
        'securityTicker must match /^[A-Z0-9.=-]+$/ regular expression',
        'contributionAmount must be a positive number',
        'estimatedFeeAmount must not be less than 0',
      ]),
    );
  });

  it('allows zero fee when recording an execution', () => {
    const dto = plainToInstance(RecordInvestmentPlanBuyDto, {
      quantity: 1,
      unitPrice: 100,
      feeAmount: 0,
      postedAt: '2026-08-05T09:00:00.000Z',
    });

    expect(collectConstraintMessages(validateSync(dto))).toEqual([]);
  });
});
