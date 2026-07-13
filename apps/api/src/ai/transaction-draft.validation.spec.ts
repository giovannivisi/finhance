import { validateCloudTransactionDraft } from '@/ai/transaction-draft.validation';

describe('validateCloudTransactionDraft', () => {
  const completeDraft = {
    amount: 14.5,
    currency: 'EUR',
    postedAt: '2026-07-11',
    description: 'Pizza dinner',
    counterparty: 'Pizzeria',
    paymentMethod: 'card',
    cardLast4: '1234',
  };

  it('accepts a semantically valid complete cloud result', () => {
    expect(validateCloudTransactionDraft(completeDraft)).toEqual(completeDraft);
  });

  it('rejects unsupported currency and invalid calendar dates', () => {
    expect(
      validateCloudTransactionDraft({ ...completeDraft, currency: 'ZZZ' }),
    ).toBeNull();
    expect(
      validateCloudTransactionDraft({
        ...completeDraft,
        postedAt: '2026-02-30',
      }),
    ).toBeNull();
  });

  it('redacts identifiers in model-supplied display fields', () => {
    expect(
      validateCloudTransactionDraft({
        ...completeDraft,
        description: 'Transfer 4111111111111111',
        counterparty: 'person@example.com',
      }),
    ).toMatchObject({
      description: 'Transfer •••• 1111',
      counterparty: '[REDACTED EMAIL]',
    });
  });

  it('rejects omitted fields and invalid last-four values', () => {
    const missingField: Omit<typeof completeDraft, 'paymentMethod'> = {
      amount: completeDraft.amount,
      currency: completeDraft.currency,
      postedAt: completeDraft.postedAt,
      description: completeDraft.description,
      counterparty: completeDraft.counterparty,
      cardLast4: completeDraft.cardLast4,
    };
    expect(validateCloudTransactionDraft(missingField)).toBeNull();
    expect(
      validateCloudTransactionDraft({ ...completeDraft, cardLast4: '12' }),
    ).toBeNull();
  });
});
