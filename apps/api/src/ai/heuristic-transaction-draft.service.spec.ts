import { HeuristicTransactionDraftService } from '@/ai/heuristic-transaction-draft.service';

describe('HeuristicTransactionDraftService', () => {
  const service = new HeuristicTransactionDraftService();
  const now = new Date('2026-07-12T12:00:00.000Z');

  it('extracts a conservative English quick-add draft', () => {
    expect(service.create('14.50 pizza yesterday amex', now)).toEqual({
      kind: 'EXPENSE',
      amount: 14.5,
      currency: null,
      postedAt: '2026-07-11',
      description: 'pizza',
      counterparty: null,
      paymentMethod: 'card',
      cardLast4: null,
      parsedBy: 'heuristic',
      cloudAttempted: false,
    });
  });

  it('recognises Italian total, date, currency, and cash hints', () => {
    expect(
      service.create('Totale € 27,40 trattoria ieri contanti', now),
    ).toEqual({
      kind: 'EXPENSE',
      amount: 27.4,
      currency: 'EUR',
      postedAt: '2026-07-11',
      description: 'trattoria',
      counterparty: null,
      paymentMethod: 'cash',
      cardLast4: null,
      parsedBy: 'heuristic',
      cloudAttempted: false,
    });
  });

  it.each([
    ['Total USD 1,234', 1_234],
    ['Totale EUR 1.234', 1_234],
    ['Total USD 1,234.56', 1_234.56],
    ['Totale EUR 1.234,56', 1_234.56],
  ])('parses the locale-specific amount in %s', (text, amount) => {
    expect(service.create(text, now)).toMatchObject({ amount });
  });

  it('does not mistake a masked card suffix for the amount', () => {
    expect(service.create('Coffee € 4.50 card •••• 4444', now)).toMatchObject({
      amount: 4.5,
      cardLast4: '4444',
      description: 'Coffee',
    });
  });

  it('uses a reviewable fallback description when text has no merchant', () => {
    expect(service.create('12.00', now)).toMatchObject({
      kind: null,
      amount: 12,
      description: 'Unlabelled transaction',
    });
  });

  it.each([
    'Salary EUR 2,400 today',
    'Freelance payment EUR 350',
    'Interest EUR 4.50',
    'Dividend EUR 12',
    'Refund EUR 25',
    'Benefit payment EUR 180',
    'Stipendio EUR 2.400',
    'Rimborso EUR 25',
  ])('recognises income language in %s', (text) => {
    expect(service.create(text, now)).toMatchObject({ kind: 'INCOME' });
  });
});
