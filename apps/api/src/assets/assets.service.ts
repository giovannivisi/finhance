import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { PricesService } from '@prices/prices.service';
import { Asset, AssetKind, AssetType, LiabilityKind, Prisma } from '@prisma/client';
import {
  BASE_CURRENCY,
  DashboardAssetView,
  DashboardResponse,
  DashboardSummary,
  MARKET_KINDS,
  RefreshAssetsResponse,
  VALUATION_STALE_MS,
  ValuationSource,
} from '@assets/assets.types';

interface PreparedAssetInput {
  userId: string | null;
  name: string;
  type: AssetType;
  kind: AssetKind | null;
  liabilityKind: LiabilityKind | null;
  ticker: string | null;
  exchange: string | null;
  quantity: Prisma.Decimal | null;
  unitPrice: Prisma.Decimal | null;
  balance: Prisma.Decimal;
  currency: string;
  notes: string | null;
  order: number;
}

interface ValuationModel {
  currentValue: Prisma.Decimal | null;
  referenceValue: Prisma.Decimal | null;
  valuationSource: ValuationSource;
  valuationAsOf: Date | null;
  isStale: boolean;
}

const ZERO = new Prisma.Decimal(0);
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
  ) {}

  async findAll(): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllWithCurrentValue(): Promise<DashboardAssetView[]> {
    const dashboard = await this.getDashboard();
    return dashboard.assets;
  }

  async getSummary(): Promise<DashboardSummary> {
    const dashboard = await this.getDashboard();
    return dashboard.summary;
  }

  async getDashboard(): Promise<DashboardResponse> {
    const assets = await this.prisma.asset.findMany({
      orderBy: [{ type: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
    const now = new Date();
    const views = assets.map((asset) => this.toDashboardAsset(asset, now));
    const summary = this.buildSummary(views);

    return {
      baseCurrency: BASE_CURRENCY,
      assets: views,
      summary,
      lastRefreshAt: this.maxDate(
        assets.flatMap((asset) => [asset.lastPriceAt, asset.lastFxRateAt]),
      )?.toISOString() ?? null,
    };
  }

  async refreshAssets(): Promise<RefreshAssetsResponse> {
    const assets = await this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });
    const refreshedAt = new Date();

    const quoteKeys = new Map<string, Asset>();
    const fxCurrencies = new Set<string>();

    for (const asset of assets) {
      if (this.isMarketAsset(asset)) {
        try {
          const symbol = this.pricesService.buildMarketSymbol({
            kind: asset.kind!,
            ticker: asset.ticker ?? '',
            exchange: asset.exchange,
            quoteCurrency: asset.currency,
          });
          quoteKeys.set(symbol, asset);
        } catch {
          continue;
        }
      }

      if (asset.currency !== BASE_CURRENCY) {
        fxCurrencies.add(asset.currency);
      }
    }

    const quoteResults = new Map<string, Prisma.Decimal | null>();
    const fxResults = new Map<string, Prisma.Decimal | null>();

    await Promise.all(
      Array.from(quoteKeys.keys()).map(async (symbol) => {
        const sample = quoteKeys.get(symbol);
        if (!sample?.kind || !sample.ticker) {
          quoteResults.set(symbol, null);
          return;
        }

        quoteResults.set(
          symbol,
          await this.pricesService.getMarketPrice(
            {
              kind: sample.kind,
              ticker: sample.ticker,
              exchange: sample.exchange,
              quoteCurrency: sample.currency,
            },
            { forceRefresh: true },
          ),
        );
      }),
    );

    await Promise.all(
      Array.from(fxCurrencies).map(async (currency) => {
        fxResults.set(
          currency,
          await this.pricesService.getFxRate(currency, BASE_CURRENCY, {
            forceRefresh: true,
          }),
        );
      }),
    );

    let updatedCount = 0;

    for (const asset of assets) {
      const data: Prisma.AssetUpdateInput = {};
      let shouldUpdate = false;

      if (this.isMarketAsset(asset)) {
        try {
          const symbol = this.pricesService.buildMarketSymbol({
            kind: asset.kind!,
            ticker: asset.ticker ?? '',
            exchange: asset.exchange,
            quoteCurrency: asset.currency,
          });
          const price = quoteResults.get(symbol) ?? null;
          if (price) {
            data.lastPrice = price;
            data.lastPriceAt = refreshedAt;
            shouldUpdate = true;
          }
        } catch {
          data.lastPrice = null;
          data.lastPriceAt = null;
          shouldUpdate = true;
        }
      } else if (asset.lastPrice !== null || asset.lastPriceAt !== null) {
        data.lastPrice = null;
        data.lastPriceAt = null;
        shouldUpdate = true;
      }

      if (asset.currency === BASE_CURRENCY) {
        if (asset.lastFxRate !== null || asset.lastFxRateAt !== null) {
          data.lastFxRate = null;
          data.lastFxRateAt = null;
          shouldUpdate = true;
        }
      } else {
        const fxRate = fxResults.get(asset.currency) ?? null;
        if (fxRate) {
          data.lastFxRate = fxRate;
          data.lastFxRateAt = refreshedAt;
          shouldUpdate = true;
        }
      }

      if (!shouldUpdate) {
        continue;
      }

      await this.prisma.asset.update({
        where: { id: asset.id },
        data,
      });
      updatedCount += 1;
    }

    const dashboard = await this.getDashboard();
    const staleCount = dashboard.assets.filter(
      (asset) => asset.isStale || asset.valuationSource === 'UNAVAILABLE',
    ).length;

    return {
      refreshedAt: refreshedAt.toISOString(),
      updatedCount,
      staleCount,
    };
  }

  async create(dto: CreateAssetDto): Promise<Asset> {
    const prepared = this.prepareAssetInput(dto);

    if (prepared.type === AssetType.LIABILITY || !this.isMarketKind(prepared.kind)) {
      return this.prisma.asset.create({
        data: this.toAssetCreateInput(prepared),
      });
    }

    return this.mergeOrCreateMarketAsset(prepared);
  }

  async findOne(id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({
      where: { id },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${id} was not found.`);
    }

    return asset;
  }

  async update(id: string, dto: UpdateAssetDto): Promise<Asset> {
    const existing = await this.findOne(id);
    const prepared = this.prepareAssetInput(dto);

    if (prepared.type === AssetType.ASSET && this.isMarketKind(prepared.kind)) {
      const duplicate = await this.prisma.asset.findUnique({
        where: {
          type_kind_ticker_exchange: {
            type: AssetType.ASSET,
            kind: prepared.kind,
            ticker: prepared.ticker!,
            exchange: prepared.exchange!,
          },
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `A position for ${prepared.ticker}${prepared.exchange ?? ''} already exists.`,
        );
      }
    }

    const data = this.toAssetWritePayload(prepared);
    const shouldClearQuote =
      !this.isMarketAsset(existing) ||
      existing.kind !== prepared.kind ||
      existing.ticker !== prepared.ticker ||
      existing.exchange !== prepared.exchange;

    const shouldClearFx = existing.currency !== prepared.currency;

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...data,
        ...(shouldClearQuote
          ? {
              lastPrice: null,
              lastPriceAt: null,
            }
          : {}),
        ...(shouldClearFx || prepared.currency === BASE_CURRENCY
          ? {
              lastFxRate: null,
              lastFxRateAt: null,
            }
          : {}),
      },
    });

    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.asset.delete({ where: { id } });
  }

  private async mergeOrCreateMarketAsset(
    prepared: PreparedAssetInput,
    attempt = 0,
  ): Promise<Asset> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.asset.findUnique({
            where: {
              type_kind_ticker_exchange: {
                type: AssetType.ASSET,
                kind: prepared.kind!,
                ticker: prepared.ticker!,
                exchange: prepared.exchange!,
              },
            },
          });

          if (!existing) {
            return tx.asset.create({
              data: this.toAssetCreateInput(prepared),
            });
          }

          const mergedQuantity = this.toDecimal(existing.quantity).plus(prepared.quantity!);
          const mergedCost = this.toDecimal(existing.balance).plus(prepared.balance);
          const mergedUnitPrice = mergedQuantity.eq(ZERO)
            ? prepared.unitPrice!
            : mergedCost.div(mergedQuantity);

          return tx.asset.update({
            where: { id: existing.id },
            data: {
              quantity: mergedQuantity,
              unitPrice: mergedUnitPrice,
              balance: mergedCost,
              currency: prepared.currency,
              notes: prepared.notes ?? existing.notes,
              order: prepared.order,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (attempt < 2 && (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2034'))) {
        return this.mergeOrCreateMarketAsset(prepared, attempt + 1);
      }

      throw error;
    }
  }

  private prepareAssetInput(dto: CreateAssetDto | UpdateAssetDto): PreparedAssetInput {
    const currency = this.pricesService.normalizeCurrency(dto.currency ?? BASE_CURRENCY);
    const name = dto.name.trim();
    const order = dto.order ?? 0;
    const notes = dto.notes ?? null;
    const userId = dto.userId ?? null;

    if (dto.type === AssetType.LIABILITY) {
      if (!dto.liabilityKind) {
        throw new BadRequestException('Liability kind is required.');
      }

      if (dto.balance == null) {
        throw new BadRequestException('Liability balance is required.');
      }

      return {
        userId,
        name,
        type: AssetType.LIABILITY,
        kind: null,
        liabilityKind: dto.liabilityKind,
        ticker: null,
        exchange: null,
        quantity: null,
        unitPrice: null,
        balance: this.toDecimal(dto.balance),
        currency,
        notes,
        order,
      };
    }

    if (!dto.kind) {
      throw new BadRequestException('Asset kind is required.');
    }

    if (this.isMarketKind(dto.kind)) {
      if (dto.quantity == null || dto.unitPrice == null) {
        throw new BadRequestException('Market assets require quantity and unit price.');
      }

      if (!dto.ticker) {
        throw new BadRequestException('Market assets require a ticker.');
      }

      const exchange = this.normalizeExchange(dto.kind, dto.exchange);
      const ticker = this.normalizeTicker(dto.kind, dto.ticker, currency);
      const quantity = this.toDecimal(dto.quantity);
      const unitPrice = this.toDecimal(dto.unitPrice);

      return {
        userId,
        name,
        type: AssetType.ASSET,
        kind: dto.kind,
        liabilityKind: null,
        ticker,
        exchange,
        quantity,
        unitPrice,
        balance: quantity.mul(unitPrice),
        currency,
        notes,
        order,
      };
    }

    if (dto.balance == null) {
      throw new BadRequestException('Amount is required for this asset kind.');
    }

    return {
      userId,
      name,
      type: AssetType.ASSET,
      kind: dto.kind,
      liabilityKind: null,
      ticker: null,
      exchange: null,
      quantity: null,
      unitPrice: null,
      balance: this.toDecimal(dto.balance),
      currency,
      notes,
      order,
    };
  }

  private normalizeTicker(kind: AssetKind, ticker: string, currency: string): string {
    const normalized = this.pricesService.normalizeTicker(ticker);

    if (kind !== AssetKind.CRYPTO) {
      return normalized;
    }

    const [baseAsset, quoteCurrency] = normalized.split('-');

    if (!baseAsset) {
      throw new BadRequestException('Crypto ticker is required.');
    }

    if (quoteCurrency && quoteCurrency !== currency) {
      throw new BadRequestException(
        `Crypto ticker ${normalized} does not match currency ${currency}.`,
      );
    }

    return quoteCurrency ? normalized : `${baseAsset}-${currency}`;
  }

  private normalizeExchange(kind: AssetKind, exchange?: string | null): string {
    const normalized = (exchange ?? '').trim().toUpperCase();

    if (kind === AssetKind.CRYPTO) {
      if (normalized && normalized !== '_CRYPTO_') {
        throw new BadRequestException('Crypto assets must use the crypto exchange sentinel.');
      }

      return '_CRYPTO_';
    }

    if (normalized === '_CRYPTO_') {
      throw new BadRequestException('Only crypto assets may use the crypto exchange sentinel.');
    }

    return normalized;
  }

  private toAssetCreateInput(prepared: PreparedAssetInput): Prisma.AssetCreateInput {
    return {
      userId: prepared.userId,
      name: prepared.name,
      type: prepared.type,
      kind: prepared.kind,
      liabilityKind: prepared.liabilityKind,
      ticker: prepared.ticker,
      exchange: prepared.exchange,
      quantity: prepared.quantity,
      unitPrice: prepared.unitPrice,
      balance: prepared.balance,
      currency: prepared.currency,
      notes: prepared.notes,
      order: prepared.order,
    };
  }

  private toAssetWritePayload(prepared: PreparedAssetInput): Prisma.AssetUpdateInput {
    return {
      userId: prepared.userId,
      name: prepared.name,
      type: prepared.type,
      kind: prepared.kind,
      liabilityKind: prepared.liabilityKind,
      ticker: prepared.ticker,
      exchange: prepared.exchange,
      quantity: prepared.quantity,
      unitPrice: prepared.unitPrice,
      balance: prepared.balance,
      currency: prepared.currency,
      notes: prepared.notes,
      order: prepared.order,
    };
  }

  private toDashboardAsset(asset: Asset, now: Date): DashboardAssetView {
    const valuation = this.buildValuation(asset, now);

    return {
      id: asset.id,
      name: asset.name,
      type: asset.type,
      kind: asset.kind,
      liabilityKind: asset.liabilityKind,
      ticker: asset.ticker,
      exchange: asset.exchange,
      quantity: this.decimalToNumber(asset.quantity),
      unitPrice: this.decimalToNumber(asset.unitPrice),
      balance: this.decimalToNumber(asset.balance) ?? 0,
      currency: asset.currency,
      notes: asset.notes,
      order: asset.order,
      lastPrice: this.decimalToNumber(asset.lastPrice),
      lastPriceAt: asset.lastPriceAt?.toISOString() ?? null,
      lastFxRate: this.decimalToNumber(asset.lastFxRate),
      lastFxRateAt: asset.lastFxRateAt?.toISOString() ?? null,
      currentValue: this.decimalToNumber(valuation.currentValue),
      referenceValue: this.decimalToNumber(valuation.referenceValue),
      valuationSource: valuation.valuationSource,
      valuationAsOf: valuation.valuationAsOf?.toISOString() ?? null,
      isStale: valuation.isStale,
    };
  }

  private buildValuation(asset: Asset, now: Date): ValuationModel {
    const referenceValue = this.convertToBaseCurrency(asset.balance, asset);
    const fxTimestamp = asset.currency === BASE_CURRENCY ? now : asset.lastFxRateAt;
    const fxStale =
      asset.currency !== BASE_CURRENCY &&
      (!fxTimestamp || now.getTime() - fxTimestamp.getTime() > VALUATION_STALE_MS);

    if (!this.isMarketAsset(asset)) {
      if (!referenceValue) {
        return {
          currentValue: null,
          referenceValue: null,
          valuationSource: 'UNAVAILABLE',
          valuationAsOf: null,
          isStale: true,
        };
      }

      return {
        currentValue: referenceValue,
        referenceValue,
        valuationSource: 'DIRECT_BALANCE',
        valuationAsOf: asset.currency === BASE_CURRENCY ? asset.updatedAt : asset.lastFxRateAt,
        isStale: fxStale,
      };
    }

    const quantity = this.toDecimal(asset.quantity);
    const priceTimestamp = asset.lastPriceAt;
    const quoteValue =
      asset.lastPrice && quantity ? quantity.mul(this.toDecimal(asset.lastPrice)) : null;
    const currentValue = quoteValue
      ? this.convertToBaseCurrency(quoteValue, asset)
      : null;
    const quoteTimestamp = this.minDate([asset.lastPriceAt, fxTimestamp]);
    const quoteStale =
      !!quoteTimestamp &&
      now.getTime() - quoteTimestamp.getTime() > VALUATION_STALE_MS;

    if (currentValue) {
      return {
        currentValue,
        referenceValue,
        valuationSource: quoteStale ? 'LAST_QUOTE' : 'LIVE',
        valuationAsOf: quoteTimestamp,
        isStale: quoteStale,
      };
    }

    if (referenceValue) {
      return {
        currentValue: null,
        referenceValue,
        valuationSource: 'AVG_COST',
        valuationAsOf: this.minDate([asset.updatedAt, fxTimestamp]),
        isStale: true,
      };
    }

    return {
      currentValue: null,
      referenceValue: null,
      valuationSource: 'UNAVAILABLE',
      valuationAsOf: priceTimestamp ?? fxTimestamp ?? null,
      isStale: true,
    };
  }

  private buildSummary(assets: DashboardAssetView[]): DashboardSummary {
    let assetsTotal = ZERO;
    let liabilitiesTotal = ZERO;

    for (const asset of assets) {
      const effectiveValue = this.valueFromView(asset.currentValue ?? asset.referenceValue);
      if (!effectiveValue) {
        continue;
      }

      if (asset.type === AssetType.ASSET) {
        assetsTotal = assetsTotal.plus(effectiveValue);
      } else {
        liabilitiesTotal = liabilitiesTotal.plus(effectiveValue);
      }
    }

    return {
      assets: assetsTotal.toNumber(),
      liabilities: liabilitiesTotal.toNumber(),
      netWorth: assetsTotal.minus(liabilitiesTotal).toNumber(),
    };
  }

  private convertToBaseCurrency(
    value: Prisma.Decimal | null,
    asset: Asset,
  ): Prisma.Decimal | null {
    if (!value) {
      return null;
    }

    if (asset.currency === BASE_CURRENCY) {
      return value;
    }

    if (!asset.lastFxRate) {
      return null;
    }

    return value.mul(this.toDecimal(asset.lastFxRate));
  }

  private isMarketAsset(asset: Pick<Asset, 'type' | 'kind'>): asset is Pick<
    Asset,
    'type' | 'kind'
  > & { kind: AssetKind } {
    return asset.type === AssetType.ASSET && this.isMarketKind(asset.kind);
  }

  private isMarketKind(kind?: AssetKind | null): kind is AssetKind {
    return !!kind && MARKET_KINDS.has(kind);
  }

  private toDecimal(value: Prisma.Decimal | number | string | null | undefined): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) {
      return value;
    }

    if (value === null || value === undefined) {
      return ZERO;
    }

    return new Prisma.Decimal(value.toString());
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
    return value ? value.toNumber() : null;
  }

  private valueFromView(value: number | null): Prisma.Decimal | null {
    if (value === null || value === undefined) {
      return null;
    }

    return new Prisma.Decimal(value.toString());
  }

  private maxDate(dates: Array<Date | null | undefined>): Date | null {
    const filtered = dates.filter((date): date is Date => !!date);
    if (filtered.length === 0) {
      return null;
    }

    return filtered.reduce((max, current) =>
      current.getTime() > max.getTime() ? current : max,
    );
  }

  private minDate(dates: Array<Date | null | undefined>): Date | null {
    const filtered = dates.filter((date): date is Date => !!date);
    if (filtered.length === 0) {
      return null;
    }

    return filtered.reduce((min, current) =>
      current.getTime() < min.getTime() ? current : min,
    );
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
    );
  }
}
