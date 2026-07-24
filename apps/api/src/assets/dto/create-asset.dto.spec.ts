import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';

function createMarketAsset(ticker: string): CreateAssetDto {
  return plainToInstance(CreateAssetDto, {
    name: 'Apple',
    type: 'ASSET',
    kind: 'STOCK',
    ticker,
    exchange: '',
    quantity: 1,
    unitPrice: 1,
    currency: 'USD',
  });
}

describe('CreateAssetDto', () => {
  it('accepts a provider-safe market ticker', () => {
    const dto = createMarketAsset('aapl.br');

    expect(validateSync(dto)).toEqual([]);
    expect(dto.ticker).toBe('AAPL.BR');
  });

  it('rejects control characters in market tickers', () => {
    const dto = createMarketAsset('AAPL\nforged log entry');

    const errors = validateSync(dto);
    const tickerError = errors.find((error) => error.property === 'ticker');

    expect(tickerError?.constraints).toHaveProperty('matches');
  });
});
