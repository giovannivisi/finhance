import { redactCloudParserText } from '@/ai/redaction';

describe('redactCloudParserText', () => {
  it('keeps only the last four digits of contiguous, spaced, and hyphenated PANs', () => {
    expect(
      redactCloudParserText(
        'cards 4111111111111111, 5555 5555 5555 4444, and 3782-822463-10005',
      ),
    ).toBe('cards •••• 1111, •••• 4444, and •••• 0005');
  });

  it('redacts IBANs, email addresses, and telephone numbers', () => {
    expect(
      redactCloudParserText(
        'IBAN IT60 X054 2811 1010 0000 0123 456, person@example.com, +39 347 123 4567',
      ),
    ).toBe('IBAN [REDACTED IBAN], [REDACTED EMAIL], [REDACTED PHONE]');
  });

  it('does not treat ordinary receipt amounts as payment-card numbers', () => {
    expect(redactCloudParserText('Total EUR 14.50, table 12')).toBe(
      'Total EUR 14.50, table 12',
    );
  });
});
