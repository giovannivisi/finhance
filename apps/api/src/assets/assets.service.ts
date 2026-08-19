import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { AccountsService } from '@accounts/accounts.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { PricesService } from '@prices/prices.service';
import type {
  MarketPriceFailure,
  StoredFxRateSnapshot,
} from '@prices/prices.service';
import {
  AccountType,
  Asset,
  AssetKind,
  AssetType,
  LiabilityKind,
  OperationType,
  Prisma,
} from '@finhance/db';
import { toAssetResponse } from '@assets/assets.mapper';
import {
  DEFAULT_REPORTING_CURRENCY,
  MARKET_KINDS,
  MAX_QUOTE_AGE_MS,
  REFRESH_COOLDOWN_MS,
  VALUATION_STALE_MS,
} from '@assets/assets.types';
import { getMarketOpenState } from '@prices/market-hours';
import { OperationLockService } from '@/request-safety/operation-lock.service';
import { ensureOwnerUserRecord } from '@/security/owner-user';
import type {
  AggregatePricingStatus,
  DashboardAssetResponse,
  DashboardResponse,
  DashboardSummary,
  LiveAssetValuationResponse,
  LiveValuationsResponse,
  RefreshAssetsResponse,
  ValuationSource,
} from '@finhance/shared';
import { isSupportedExchangeValue } from '@/common/catalogues';

interface PreparedAssetInput {
  userId: string;
  accountId: string | null;
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

type FxResolutionMap = Map<string, StoredFxRateSnapshot>;

interface QuoteRefreshFailure {
  symbol: string;
  failure: MarketPriceFailure;
}

const ZERO = new Prisma.Decimal(0);
const MARKET_FETCH_BATCH_SIZE = 1;
@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
    private readonly accountsService: AccountsService,
    private readonly operationLockService: OperationLockService,
  ) {}

  async findAll(ownerId: string): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllWithCurrentValue(
    ownerId: string,
  ): Promise<DashboardAssetResponse[]> {
    const dashboard = await this.getDashboard(ownerId);
    return dashboard.assets;
  }

  async getSummary(ownerId: string): Promise<DashboardSummary> {
    const dashboard = await this.getDashboard(ownerId);
    return dashboard.summary;
  }

  async getDashboard(ownerId: string): Promise<DashboardResponse> {
    const [assets, user] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId: ownerId },
        orderBy: [{ type: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
        include: { account: true },
      }),
      this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { assetKindOrder: true, userSettings: true },
      }),
    ]);
    const now = new Date();
    const reportingCurrency = this.resolveReportingCurrency(user?.userSettings);
    const fxCurrencies = [
      ...new Set(
        assets
          .map((asset) => asset.currency)
          .filter((currency) => currency !== reportingCurrency),
      ),
    ];
    const fxRates: FxResolutionMap = new Map();
    await Promise.all(
      fxCurrencies.map(async (currency) => {
        fxRates.set(
          currency,
          await this.pricesService.getStoredFxRateSnapshot(
            ownerId,
            now,
            currency,
            reportingCurrency,
          ),
        );
      }),
    );
    const views = assets.map((asset) =>
      this.toDashboardAsset(asset, now, reportingCurrency, fxRates),
    );
    const summary = this.buildSummary(views);
    const pricingStatus = this.buildPricingStatus(views, fxRates);
    const fxRefreshMoments = [...fxRates.values()]
      .map((entry) => entry.updatedAt)
      .filter((value): value is Date => value instanceof Date);

    return {
      reportingCurrency,
      assets: views,
      summary,
      pricingStatus,
      assetKindOrder: Array.isArray(user?.assetKindOrder)
        ? (user.assetKindOrder as string[])
        : [],
      lastRefreshAt:
        this.maxDate([
          ...assets.flatMap((asset) => [asset.lastPriceAt]),
          ...fxRefreshMoments,
        ])?.toISOString() ?? null,
      latestSnapshotDate: null,
      latestSnapshotCapturedAt: null,
      latestSnapshotIsPartial: null,
    };
  }

  /**
   * Returns the latest persisted quotes for active market positions. This
   * compatibility endpoint is deliberately read-only: only refreshAssets may
   * contact an upstream provider and advance a stored quote timestamp.
   */
  async getLiveValuations(ownerId: string): Promise<LiveValuationsResponse> {
    const now = new Date();
    const [assets, user] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId: ownerId, type: AssetType.ASSET },
      }),
      this.prisma.user.findUnique({
        where: { id: ownerId },
        select: { userSettings: true },
      }),
    ]);
    const reportingCurrency = this.resolveReportingCurrency(user?.userSettings);

    const candidates = assets.filter(
      (asset) =>
        this.isMarketAsset(asset) &&
        !!asset.ticker &&
        this.toDecimal(asset.quantity).gt(ZERO),
    );

    const fxCurrencies = [
      ...new Set(
        candidates
          .map((asset) => asset.currency)
          .filter((currency) => currency !== reportingCurrency),
      ),
    ];
    const fxSnapshots: FxResolutionMap = new Map();
    await Promise.all(
      fxCurrencies.map(async (currency) => {
        fxSnapshots.set(
          currency,
          await this.pricesService.getStoredFxRateSnapshot(
            ownerId,
            now,
            currency,
            reportingCurrency,
          ),
        );
      }),
    );

    const quotedCandidates = candidates.filter(
      (asset) => asset.lastPrice !== null,
    );
    const quotes = quotedCandidates.map((asset): LiveAssetValuationResponse => {
      const price = this.toDecimal(asset.lastPrice);
      const quantity = this.toDecimal(asset.quantity);
      const value = quantity.mul(price);
      const fxRate =
        asset.currency === reportingCurrency
          ? new Prisma.Decimal(1)
          : (fxSnapshots.get(asset.currency)?.rate ?? null);
      const fxSnapshot = fxSnapshots.get(asset.currency) ?? null;
      const valueInReporting = fxRate ? value.mul(fxRate) : null;
      const priceAgeMs = asset.lastPriceAt
        ? now.getTime() - asset.lastPriceAt.getTime()
        : null;
      const valuationAsOf = this.minDate([
        asset.lastPriceAt,
        asset.currency === reportingCurrency ? null : fxSnapshot?.updatedAt,
      ]);

      return {
        assetId: asset.id,
        quantity: quantity.toNumber(),
        price: price.toNumber(),
        currency: asset.currency,
        value: value.toNumber(),
        valueInReporting: valueInReporting?.toNumber() ?? null,
        asOf: valuationAsOf?.toISOString() ?? null,
        isStale:
          this.isQuoteStale(asset, priceAgeMs, now) ||
          (asset.currency !== reportingCurrency &&
            fxSnapshot?.status !== 'EXACT'),
      };
    });

    return {
      asOf:
        this.maxDate(
          quotedCandidates.map((asset) => asset.lastPriceAt),
        )?.toISOString() ?? now.toISOString(),
      reportingCurrency,
      quotes,
    };
  }

  async refreshAssets(ownerId: string): Promise<RefreshAssetsResponse> {
    const refreshedAt = new Date();
    return this.operationLockService.runExclusive(
      {
        userId: ownerId,
        type: OperationType.ASSET_REFRESH,
        startedAt: refreshedAt,
        inProgressMessage: 'Refresh already in progress.',
        cooldownMs: REFRESH_COOLDOWN_MS,
        cooldownMessage: (remainingSeconds) =>
          `Refresh is cooling down. Try again in ${remainingSeconds}s.`,
      },
      async () => {
        const [assets, user] = await Promise.all([
          this.prisma.asset.findMany({
            where: { userId: ownerId },
            orderBy: { createdAt: 'asc' },
            include: {
              account: {
                select: {
                  currency: true,
                },
              },
            },
          }),
          this.prisma.user.findUnique({
            where: { id: ownerId },
            select: { userSettings: true },
          }),
        ]);
        const reportingCurrency = this.resolveReportingCurrency(
          user?.userSettings,
        );

        const quoteKeys = new Map<string, Asset>();
        const quoteBuildFailures: QuoteRefreshFailure[] = [];
        const fxPairs = new Set<string>();

        for (const asset of assets) {
          if (this.isMarketAsset(asset)) {
            try {
              const symbol =
                asset.marketDataSymbol ??
                this.pricesService.buildMarketSymbol({
                  kind: asset.kind,
                  ticker: asset.ticker ?? '',
                  exchange: asset.exchange,
                  quoteCurrency: asset.currency,
                });
              quoteKeys.set(symbol, asset);
            } catch (error) {
              const symbol = this.marketAssetLabel(asset);
              this.logger.warn(
                `Market price refresh skipped invalid symbol ${symbol}: ${(error as Error).message}`,
              );
              quoteBuildFailures.push({
                symbol,
                failure: {
                  provider: 'Market data',
                  reason: 'NOT_FOUND',
                  status: 400,
                },
              });
            }
          }

          if (asset.currency !== reportingCurrency) {
            fxPairs.add(this.fxPairKey(asset.currency, reportingCurrency));
          }

          if (
            asset.account?.currency &&
            asset.account.currency !== asset.currency
          ) {
            fxPairs.add(this.fxPairKey(asset.currency, asset.account.currency));
          }
        }

        const quoteResults = new Map<
          string,
          Awaited<ReturnType<PricesService['getMarketPriceResolution']>>
        >();
        const fxResults = new Map<string, Prisma.Decimal | null>();

        await this.mapInBatches(
          [...quoteKeys.keys()],
          MARKET_FETCH_BATCH_SIZE,
          async (symbol) => {
            const sample = quoteKeys.get(symbol);
            if (!sample?.kind || !sample.ticker) {
              return;
            }

            quoteResults.set(
              symbol,
              await this.pricesService.getMarketPriceResolution(
                {
                  kind: sample.kind,
                  ticker: sample.ticker,
                  exchange: sample.exchange,
                  quoteCurrency: sample.currency,
                },
                { forceRefresh: true },
                sample.marketDataSymbol,
              ),
            );
          },
        );

        const quoteFailures: QuoteRefreshFailure[] = [
          ...quoteBuildFailures,
          ...[...quoteKeys.entries()].flatMap(([symbol, asset]) => {
            const result = quoteResults.get(symbol)?.result;
            return result?.price !== null && result?.price !== undefined
              ? []
              : [
                  {
                    symbol: this.marketAssetLabel(asset),
                    failure: result?.failure ?? {
                      provider: 'Market data',
                      reason: 'UNAVAILABLE' as const,
                      status: null,
                    },
                  },
                ];
          }),
        ];
        const requestedQuoteCount = quoteKeys.size + quoteBuildFailures.length;
        const refreshedQuoteCount = [...quoteResults.values()].filter(
          ({ result }) => result.price !== null,
        ).length;

        if (requestedQuoteCount > 0 && refreshedQuoteCount === 0) {
          const message = this.describeQuoteRefreshFailure(quoteFailures);
          this.logger.warn(
            `Market price refresh failed for every requested symbol: ${this.formatQuoteFailureLog(quoteFailures)}`,
          );
          throw new ServiceUnavailableException(message);
        }

        await this.mapInBatches(
          [...fxPairs],
          MARKET_FETCH_BATCH_SIZE,
          async (pairKey) => {
            const [fromCurrency, toCurrency] = pairKey.split(':');
            fxResults.set(
              pairKey,
              await this.pricesService.getFxRateForDate(
                ownerId,
                refreshedAt,
                fromCurrency,
                toCurrency,
                {
                  forceRefresh: true,
                },
              ),
            );
          },
        );

        let updatedCount = 0;

        for (const asset of assets) {
          const data: Prisma.AssetUpdateInput = {};
          let shouldUpdate = false;

          if (this.isMarketAsset(asset)) {
            try {
              const symbol =
                asset.marketDataSymbol ??
                this.pricesService.buildMarketSymbol({
                  kind: asset.kind,
                  ticker: asset.ticker ?? '',
                  exchange: asset.exchange,
                  quoteCurrency: asset.currency,
                });
              const quoteResult = quoteResults.get(symbol);
              const price = quoteResult?.result.price ?? null;
              if (price) {
                data.lastPrice = price;
                data.lastPriceAt = refreshedAt;
                shouldUpdate = true;
              }
              if (
                price &&
                quoteResult?.marketSymbol &&
                quoteResult.marketSymbol !== asset.marketDataSymbol
              ) {
                data.marketDataSymbol = quoteResult.marketSymbol;
                shouldUpdate = true;
              }
            } catch {
              // A malformed or unsupported symbol must not erase the last
              // successfully stored valuation during an otherwise partial refresh.
            }
          } else if (asset.lastPrice !== null || asset.lastPriceAt !== null) {
            data.lastPrice = null;
            data.lastPriceAt = null;
            shouldUpdate = true;
          }

          if (asset.currency === reportingCurrency) {
            if (asset.lastFxRate !== null || asset.lastFxRateAt !== null) {
              data.lastFxRate = null;
              data.lastFxRateAt = null;
              shouldUpdate = true;
            }
          } else {
            const fxRate =
              fxResults.get(
                this.fxPairKey(asset.currency, reportingCurrency),
              ) ?? null;
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

        const dashboard = await this.getDashboard(ownerId);
        const staleCount = dashboard.assets.filter(
          (asset) => asset.isStale || asset.valuationSource === 'UNAVAILABLE',
        ).length;

        return {
          refreshedAt: refreshedAt.toISOString(),
          updatedCount,
          staleCount,
          priceRefresh: {
            status:
              requestedQuoteCount === 0
                ? 'NOT_REQUESTED'
                : quoteFailures.length > 0
                  ? 'PARTIAL'
                  : 'SUCCESS',
            requestedCount: requestedQuoteCount,
            refreshedCount: refreshedQuoteCount,
            failedCount: quoteFailures.length,
            message:
              quoteFailures.length > 0
                ? this.describePartialQuoteRefresh(
                    refreshedQuoteCount,
                    requestedQuoteCount,
                    quoteFailures,
                  )
                : null,
          },
        };
      },
    );
  }

  async create(ownerId: string, dto: CreateAssetDto): Promise<Asset> {
    const prepared = this.prepareAssetInput(ownerId, dto);

    if (
      prepared.type === AssetType.LIABILITY ||
      !this.isMarketKind(prepared.kind)
    ) {
      await this.accountsService.assertAccountAssignmentAllowed(
        ownerId,
        prepared.accountId,
      );
      return this.prisma.asset.create({
        data: this.toAssetCreateInput(prepared),
      });
    }

    await this.assertMarketAssetBrokerAccount(ownerId, prepared.accountId);
    return this.mergeOrCreateMarketAsset(prepared);
  }

  async findOne(ownerId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, userId: ownerId },
    });

    if (!asset) {
      throw new NotFoundException(`Asset ${id} was not found.`);
    }

    return asset;
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateAssetDto,
  ): Promise<Asset> {
    const existing = await this.findOne(ownerId, id);
    const prepared = this.prepareAssetInput(ownerId, dto);
    await this.accountsService.assertAccountAssignmentAllowed(
      ownerId,
      prepared.accountId,
      existing.accountId,
    );

    if (prepared.type === AssetType.ASSET && this.isMarketKind(prepared.kind)) {
      await this.assertMarketAssetBrokerAccount(
        ownerId,
        prepared.accountId,
        existing.accountId,
      );
      const duplicate = await this.prisma.asset.findFirst({
        where: {
          userId: ownerId,
          type: AssetType.ASSET,
          kind: prepared.kind,
          ticker: prepared.ticker!,
          exchange: prepared.exchange!,
          accountId: prepared.accountId,
        },
      });

      if (duplicate && duplicate.id !== id) {
        throw new ConflictException(
          `A position for ${prepared.ticker}${prepared.exchange ?? ''} already exists in this account.`,
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
              marketDataSymbol: null,
            }
          : {}),
        ...(shouldClearFx || prepared.currency === DEFAULT_REPORTING_CURRENCY
          ? {
              lastFxRate: null,
              lastFxRateAt: null,
            }
          : {}),
      },
    });

    return updated;
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.findOne(ownerId, id);
    try {
      await this.prisma.asset.delete({ where: { id } });
    } catch (error) {
      if (this.isPrismaError(error, 'P2003')) {
        throw new ConflictException(
          'Assets with brokerage activity cannot be deleted.',
        );
      }

      throw error;
    }
  }

  async reorderAssets(ownerId: string, assetIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      assetIds.map((id, index) =>
        this.prisma.asset.updateMany({
          where: { id, userId: ownerId },
          data: { order: index },
        }),
      ),
    );
  }

  async reorderAssetKinds(ownerId: string, kindOrder: string[]): Promise<void> {
    await ensureOwnerUserRecord(this.prisma, {
      userId: ownerId,
    });
    await this.prisma.user.update({
      where: { id: ownerId },
      data: { assetKindOrder: kindOrder },
    });
  }

  private async mergeOrCreateMarketAsset(
    prepared: PreparedAssetInput,
    attempt = 0,
  ): Promise<Asset> {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const existing = await tx.asset.findFirst({
            where: {
              userId: prepared.userId,
              type: AssetType.ASSET,
              kind: prepared.kind!,
              ticker: prepared.ticker!,
              exchange: prepared.exchange!,
              accountId: prepared.accountId,
            },
          });

          if (!existing) {
            await this.assertMarketAssetBrokerAccount(
              prepared.userId,
              prepared.accountId,
            );
            return tx.asset.create({
              data: this.toAssetCreateInput(prepared),
            });
          }

          const mergedAccountId = this.resolveMergedAccountId(
            existing,
            prepared,
          );
          await this.assertMarketAssetBrokerAccount(
            prepared.userId,
            mergedAccountId,
            existing.accountId,
          );

          const mergedQuantity = this.toDecimal(existing.quantity).plus(
            prepared.quantity!,
          );
          const mergedCost = this.toDecimal(existing.balance).plus(
            prepared.balance,
          );
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
              accountId: mergedAccountId,
              order: prepared.order,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      if (
        attempt < 2 &&
        (this.isPrismaError(error, 'P2002') ||
          this.isPrismaError(error, 'P2034'))
      ) {
        return this.mergeOrCreateMarketAsset(prepared, attempt + 1);
      }

      throw error;
    }
  }

  private prepareAssetInput(
    ownerId: string,
    dto: CreateAssetDto | UpdateAssetDto,
  ): PreparedAssetInput {
    const currency = this.pricesService.normalizeCurrency(
      dto.currency ?? DEFAULT_REPORTING_CURRENCY,
    );
    const name = dto.name.trim();
    const order = dto.order ?? 0;
    const accountId = dto.accountId ?? null;
    const notes = dto.notes ?? null;

    if (dto.type === AssetType.LIABILITY) {
      if (!dto.liabilityKind) {
        throw new BadRequestException('Liability kind is required.');
      }

      if (dto.balance == null) {
        throw new BadRequestException('Liability balance is required.');
      }

      return {
        userId: ownerId,
        accountId,
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
        throw new BadRequestException(
          'Market assets require quantity and unit price.',
        );
      }

      if (!dto.ticker) {
        throw new BadRequestException('Market assets require a ticker.');
      }

      const exchange = this.normalizeExchange(dto.kind, dto.exchange);
      const ticker = this.normalizeTicker(dto.kind, dto.ticker, currency);
      const quantity = this.toDecimal(dto.quantity);
      const unitPrice = this.toDecimal(dto.unitPrice);

      return {
        userId: ownerId,
        accountId,
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
      userId: ownerId,
      accountId,
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

  private async assertMarketAssetBrokerAccount(
    ownerId: string,
    accountId: string | null,
    currentAccountId?: string | null,
  ): Promise<void> {
    if (!accountId) {
      throw new BadRequestException(
        'Market assets must belong to a BROKER account.',
      );
    }

    const account = await this.accountsService.getAssignableAccount(
      ownerId,
      accountId,
      currentAccountId,
    );

    if (account.type !== AccountType.BROKER) {
      throw new BadRequestException(
        'Market assets must belong to a BROKER account.',
      );
    }
  }

  private normalizeTicker(
    kind: AssetKind,
    ticker: string,
    currency: string,
  ): string {
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
        throw new BadRequestException(
          'Crypto assets must use the crypto exchange sentinel.',
        );
      }

      return '_CRYPTO_';
    }

    if (normalized === '_CRYPTO_') {
      throw new BadRequestException(
        'Only crypto assets may use the crypto exchange sentinel.',
      );
    }

    if (!isSupportedExchangeValue(normalized, kind)) {
      throw new BadRequestException('Unsupported exchange.');
    }

    return normalized;
  }

  private resolveMergedAccountId(
    existing: Pick<Asset, 'accountId'>,
    prepared: Pick<PreparedAssetInput, 'accountId'>,
  ): string | null {
    if (prepared.accountId === null) {
      return existing.accountId;
    }

    if (
      existing.accountId === null ||
      existing.accountId === prepared.accountId
    ) {
      return prepared.accountId;
    }

    throw new ConflictException(
      'This position already belongs to another account. Reassign the asset before adding more.',
    );
  }

  private toAssetCreateInput(
    prepared: PreparedAssetInput,
  ): Prisma.AssetUncheckedCreateInput {
    return {
      userId: prepared.userId,
      accountId: prepared.accountId,
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

  private toAssetWritePayload(
    prepared: PreparedAssetInput,
  ): Prisma.AssetUncheckedUpdateInput {
    return {
      userId: prepared.userId,
      accountId: prepared.accountId,
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

  private toDashboardAsset(
    asset: Asset & { account?: { name: string; type: AccountType } | null },
    now: Date,
    reportingCurrency: string,
    fxRates: FxResolutionMap,
  ): DashboardAssetResponse {
    const valuation = this.buildValuation(
      asset,
      now,
      reportingCurrency,
      fxRates,
    );

    return {
      ...toAssetResponse(asset),
      accountName: asset.account?.name ?? null,
      accountType: asset.account?.type ?? null,
      currentValue: this.decimalToNumber(valuation.currentValue),
      referenceValue: this.decimalToNumber(valuation.referenceValue),
      valuationSource: valuation.valuationSource,
      valuationAsOf: valuation.valuationAsOf?.toISOString() ?? null,
      isStale: valuation.isStale,
    };
  }

  private buildValuation(
    asset: Asset,
    now: Date,
    reportingCurrency: string,
    fxRates: FxResolutionMap,
  ): ValuationModel {
    const referenceValue = this.convertToReportingCurrency(
      asset.balance,
      asset.currency,
      reportingCurrency,
      fxRates,
    );
    const fxSnapshot = fxRates.get(asset.currency) ?? null;
    const fxTimestamp = fxSnapshot?.updatedAt ?? null;
    const fxMissing =
      asset.currency !== reportingCurrency && fxSnapshot?.rate === null;
    const fxStale = fxSnapshot?.status === 'STALE';

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
        valuationAsOf: this.minDate([asset.updatedAt, fxTimestamp]),
        isStale: fxStale || fxMissing,
      };
    }

    const quantity = this.toDecimal(asset.quantity);
    const priceTimestamp = asset.lastPriceAt;
    const quoteValue =
      asset.lastPrice && quantity
        ? quantity.mul(this.toDecimal(asset.lastPrice))
        : null;
    const currentValue = quoteValue
      ? this.convertToReportingCurrency(
          quoteValue,
          asset.currency,
          reportingCurrency,
          fxRates,
        )
      : null;
    const quoteTimestamp = this.minDate([asset.lastPriceAt, fxTimestamp]);
    const quoteAgeMs = quoteTimestamp
      ? now.getTime() - quoteTimestamp.getTime()
      : null;
    // A quote only counts as "live" right after a fetch with usable FX. Outside
    // that window we still show it, but as the latest stored quote.
    const isLiveQuote =
      quoteAgeMs !== null && quoteAgeMs <= VALUATION_STALE_MS && !fxStale;
    const quoteStale = this.isQuoteStale(asset, quoteAgeMs, now);

    if (currentValue) {
      return {
        currentValue,
        referenceValue,
        valuationSource: isLiveQuote ? 'LIVE' : 'LAST_QUOTE',
        valuationAsOf: quoteTimestamp,
        isStale: quoteStale || fxStale,
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

  private async mapInBatches<T, R>(
    items: readonly T[],
    batchSize: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    const effectiveBatchSize = Math.max(1, batchSize);

    for (let start = 0; start < items.length; start += effectiveBatchSize) {
      results.push(
        ...(await Promise.all(
          items.slice(start, start + effectiveBatchSize).map(mapper),
        )),
      );
    }

    return results;
  }

  /**
   * Decides whether a stored market quote is genuinely behind the market.
   *
   * Age alone is not enough: outside trading hours the last close is the most
   * recent price the venue has produced, so an "old" quote is not stale. A
   * quote is therefore only stale when it is older than the live window *and*
   * either its venue is currently trading (so a newer price should exist) or it
   * has aged past {@link MAX_QUOTE_AGE_MS} (a sign refreshes have been failing).
   */
  private isQuoteStale(
    asset: Pick<Asset, 'exchange' | 'kind'>,
    quoteAgeMs: number | null,
    now: Date,
  ): boolean {
    if (quoteAgeMs === null) {
      return true;
    }
    if (quoteAgeMs <= VALUATION_STALE_MS) {
      return false;
    }
    if (quoteAgeMs > MAX_QUOTE_AGE_MS) {
      return true;
    }
    return getMarketOpenState(asset.exchange, asset.kind, now) !== 'CLOSED';
  }

  private buildSummary(assets: DashboardAssetResponse[]): DashboardSummary {
    let assetsTotal = ZERO;
    let liabilitiesTotal = ZERO;

    for (const asset of assets) {
      const effectiveValue = this.valueFromView(
        asset.currentValue ?? asset.referenceValue,
      );
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

  private convertToReportingCurrency(
    value: Prisma.Decimal | null,
    fromCurrency: string,
    reportingCurrency: string,
    fxRates: FxResolutionMap,
  ): Prisma.Decimal | null {
    if (!value) {
      return null;
    }

    if (fromCurrency === reportingCurrency) {
      return value;
    }

    const rate = fxRates.get(fromCurrency)?.rate ?? null;
    if (!rate) {
      return null;
    }

    return value.mul(this.toDecimal(rate));
  }

  private buildPricingStatus(
    assets: DashboardAssetResponse[],
    fxRates: FxResolutionMap,
  ): AggregatePricingStatus {
    const hasStaleQuotes = assets.some(
      (asset) =>
        asset.isStale &&
        (asset.valuationSource === 'LAST_QUOTE' ||
          asset.valuationSource === 'AVG_COST'),
    );
    const hasStaleFx = [...fxRates.values()].some(
      (entry) => entry.status === 'STALE',
    );
    const hasMissingFx = [...fxRates.values()].some(
      (entry) => entry.status === 'MISSING',
    );

    const state = hasMissingFx
      ? 'PARTIAL'
      : hasStaleQuotes || hasStaleFx
        ? 'STALE'
        : 'FRESH';

    return {
      state,
      refreshSuggested: state !== 'FRESH',
      hasStaleQuotes,
      hasStaleFx,
      hasMissingFx,
    };
  }

  private fxPairKey(fromCurrency: string, toCurrency: string): string {
    return `${fromCurrency}:${toCurrency}`;
  }

  private marketAssetLabel(
    asset: Pick<Asset, 'ticker' | 'exchange' | 'name'>,
  ): string {
    return asset.ticker ? `${asset.ticker}${asset.exchange ?? ''}` : asset.name;
  }

  private describeQuoteRefreshFailure(
    failures: readonly QuoteRefreshFailure[],
  ): string {
    const providers = [
      ...new Set(failures.map(({ failure }) => failure.provider)),
    ];
    const provider =
      providers.length === 1 ? providers[0] : 'The market data provider';
    const reasons = new Set(failures.map(({ failure }) => failure.reason));

    if (reasons.size === 1 && reasons.has('RATE_LIMITED')) {
      return `${provider} is rate-limiting price requests. Stored prices were kept; try again later.`;
    }
    if (reasons.size === 1 && reasons.has('REQUEST_LIMITED')) {
      return 'The market-data request limit has been reached. Stored prices were kept; try again later.';
    }
    if (reasons.has('AUTHENTICATION')) {
      return `${provider} authentication failed. Stored prices were kept; the server configuration needs attention.`;
    }
    if (reasons.size === 1 && reasons.has('NOT_FOUND')) {
      return `No current price was found for ${this.formatFailureSymbols(failures)}. Check the ticker and exchange. Stored prices were kept.`;
    }
    if (reasons.size === 1 && reasons.has('TIMEOUT')) {
      return `${provider} timed out while updating prices. Stored prices were kept; try again.`;
    }

    return `${provider} could not update market prices. Stored prices were kept; try again later.`;
  }

  private describePartialQuoteRefresh(
    refreshedCount: number,
    requestedCount: number,
    failures: readonly QuoteRefreshFailure[],
  ): string {
    return `Updated ${refreshedCount} of ${requestedCount} market prices. Could not refresh ${this.formatFailureSymbols(failures)}; stored prices were kept for those holdings.`;
  }

  private formatFailureSymbols(
    failures: readonly QuoteRefreshFailure[],
  ): string {
    const symbols = [...new Set(failures.map(({ symbol }) => symbol))];
    const visible = symbols.slice(0, 3).join(', ');
    return symbols.length > 3
      ? `${visible} and ${symbols.length - 3} more`
      : visible;
  }

  private formatQuoteFailureLog(
    failures: readonly QuoteRefreshFailure[],
  ): string {
    return failures
      .map(
        ({ symbol, failure }) =>
          `${symbol} provider=${failure.provider} reason=${failure.reason} status=${failure.status ?? 'unknown'}`,
      )
      .join('; ');
  }

  private resolveReportingCurrency(
    value: Prisma.JsonValue | null | undefined,
  ): string {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const candidate = (value as Record<string, unknown>).reportingCurrency;
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim().toUpperCase();
      }
    }

    return DEFAULT_REPORTING_CURRENCY;
  }

  private isMarketAsset(
    asset: Pick<Asset, 'type' | 'kind'>,
  ): asset is Pick<Asset, 'type' | 'kind'> & { kind: AssetKind } {
    return asset.type === AssetType.ASSET && this.isMarketKind(asset.kind);
  }

  private isMarketKind(kind?: AssetKind | null): kind is AssetKind {
    return !!kind && MARKET_KINDS.has(kind);
  }

  private toDecimal(
    value: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal {
    if (value instanceof Prisma.Decimal) {
      return value;
    }

    if (value === null || value === undefined) {
      return ZERO;
    }

    return new Prisma.Decimal(value.toString());
  }

  private decimalToNumber(
    value: Prisma.Decimal | null | undefined,
  ): number | null {
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
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === code
    );
  }
}
