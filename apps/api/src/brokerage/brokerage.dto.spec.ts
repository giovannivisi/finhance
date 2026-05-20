import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync, type ValidationError } from 'class-validator';
import { AssetKind } from '@finhance/db';
import { CreateBrokerageBuyDto } from '@brokerage/dto/create-brokerage-buy.dto';
import { UpdatePortfolioAllocationTargetsDto } from '@brokerage/dto/update-portfolio-allocation-targets.dto';

function collectConstraintMessages(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...collectConstraintMessages(error.children ?? []),
  ]);
}

describe('Brokerage DTO validation', () => {
  it('rejects oversized market symbols on buy requests', () => {
    const dto = plainToInstance(CreateBrokerageBuyDto, {
      kind: AssetKind.STOCK,
      currency: 'usd',
      quantity: 1,
      unitPrice: 10,
      postedAt: '2026-05-20T10:00:00.000Z',
      ticker: 'A'.repeat(33),
      exchange: 'X'.repeat(25),
    });

    const messages = collectConstraintMessages(validateSync(dto));
    expect(messages).toEqual(
      expect.arrayContaining([
        'ticker must be shorter than or equal to 32 characters',
        'exchange must be shorter than or equal to 24 characters',
      ]),
    );
  });

  it('rejects invalid exchange characters in allocation targets', () => {
    const dto = plainToInstance(UpdatePortfolioAllocationTargetsDto, {
      assetKindTargets: [],
      securityTargets: [
        {
          kind: AssetKind.STOCK,
          ticker: 'AAPL',
          exchange: 'NASDAQ!',
          targetPercent: 100,
        },
      ],
    });

    const messages = collectConstraintMessages(validateSync(dto));
    expect(messages).toEqual(
      expect.arrayContaining([
        'exchange must match /^[A-Z0-9.=-]+$/ regular expression',
      ]),
    );
  });
});
