import { AssetKind } from '@finhance/db';
import { getMarketOpenState } from './market-hours';

describe('getMarketOpenState', () => {
  it('reports Eurozone venues open during the CET session on a weekday', () => {
    // 2026-06-19 14:00Z = Fri 16:00 CEST (within 09:00–17:30).
    const at = new Date('2026-06-19T14:00:00Z');
    expect(getMarketOpenState('.DE', AssetKind.STOCK, at)).toBe('OPEN');
    expect(getMarketOpenState('.MI', AssetKind.STOCK, at)).toBe('OPEN');
    expect(getMarketOpenState('.HM', AssetKind.STOCK, at)).toBe('OPEN');
  });

  it('reports Eurozone venues closed after the CET session ends', () => {
    // 2026-06-19 16:00Z = Fri 18:00 CEST (after the 17:30 close).
    const at = new Date('2026-06-19T16:00:00Z');
    expect(getMarketOpenState('.DE', AssetKind.STOCK, at)).toBe('CLOSED');
    expect(getMarketOpenState('.HM', AssetKind.STOCK, at)).toBe('CLOSED');
  });

  it('reports Eurozone venues closed at the weekend', () => {
    // 2026-06-20 10:00Z = Sat 12:00 CEST.
    const at = new Date('2026-06-20T10:00:00Z');
    expect(getMarketOpenState('.DE', AssetKind.STOCK, at)).toBe('CLOSED');
  });

  it('uses the listing timezone, so US is open while Europe is shut', () => {
    // 2026-06-19 16:00Z = Fri 12:00 EDT (US open) but 18:00 CEST (EU shut).
    const at = new Date('2026-06-19T16:00:00Z');
    expect(getMarketOpenState('', AssetKind.STOCK, at)).toBe('OPEN');
    expect(getMarketOpenState('.DE', AssetKind.STOCK, at)).toBe('CLOSED');
  });

  it('treats crypto as always open', () => {
    const at = new Date('2026-06-20T10:00:00Z'); // Saturday
    expect(getMarketOpenState('', AssetKind.CRYPTO, at)).toBe('OPEN');
    expect(getMarketOpenState('.DE', AssetKind.CRYPTO, at)).toBe('OPEN');
  });

  it('returns UNKNOWN for venues without a configured session', () => {
    const at = new Date('2026-06-19T14:00:00Z');
    expect(getMarketOpenState('.XYZ', AssetKind.STOCK, at)).toBe('UNKNOWN');
  });
});
