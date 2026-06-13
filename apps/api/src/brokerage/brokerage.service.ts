import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { AccountsService } from '@accounts/accounts.service';
import { toAccountResponse } from '@accounts/accounts.mapper';
import { AssetsService } from '@assets/assets.service';
import { PricesService } from '@prices/prices.service';
import type {
  MarketSeries,
  StoredFxRateSnapshot,
} from '@prices/prices.service';
import { TransactionsService } from '@transactions/transactions.service';
import type { LogicalTransactionEntry } from '@transactions/transactions.types';
import { toTransactionResponse } from '@transactions/transactions.mapper';
import type { AccountDeletionState } from '@accounts/accounts.service';
import {
  Account,
  AccountType,
  Asset,
  AssetKind,
  AssetType,
  BrokerageOperation,
  BrokerageOperationKind,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@finhance/db';
import type {
  AggregatePricingStatus,
  BrokerageAccountSummaryResponse,
  BrokerageActivityItemResponse,
  BrokerageOperationResponse,
  BrokeragePerformancePointResponse,
  BrokeragePerformanceRange,
  BrokeragePerformanceResponse,
  BrokeragePositionResponse,
  BrokerageWorkspaceResponse,
  CreateBrokerageBuyRequest,
  CreateBrokerageDividendRequest,
  CreateBrokerageFeeRequest,
  CreateBrokerageSellRequest,
  PortfolioAllocationSnapshotItemResponse,
  PortfolioAllocationSnapshotResponse,
  PortfolioAllocationTargetsResponse,
  UpdatePortfolioAllocationTargetsRequest,
} from '@finhance/shared';
import {
  isSupportedCurrencyCode,
  isSupportedExchangeValue,
} from '@/common/catalogues';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);
const BROKERAGE_ACTIVITY_LIMIT = 200;
const MARKET_KINDS = new Set<AssetKind>([
  AssetKind.STOCK,
  AssetKind.BOND,
  AssetKind.CRYPTO,
]);
const PERFORMANCE_MAX_POINTS = 500;

const KIND_LABELS: Record<AssetKind, string> = {
  CASH: 'Cash',
  STOCK: 'Stocks',
  BOND: 'Bonds',
  CRYPTO: 'Crypto',
  REAL_ESTATE: 'Real Estate',
  PENSION: 'Pension',
  COMMODITY: 'Commodity',
  OTHER: 'Other',
};

type BrokerageReadClient = PrismaService | Prisma.TransactionClient;
type BrokerageWriteClient = Prisma.TransactionClient;
type DashboardAssetView = Awaited<
  ReturnType<AssetsService['getDashboard']>
>['assets'][number];

interface SecurityTargetModel {
  kind: AssetKind;
  ticker: string;
  exchange: string;
  name: string | null;
  targetPercent: Prisma.Decimal;
}

/** A priced position whose value can be reconstructed over time. */
interface PerformancePricedPosition {
  assetId: string;
  currency: string;
  currentQuantity: Prisma.Decimal;
  series: MarketSeries;
  /** Operation timestamps and signed quantity deltas, sorted ascending by postedAt. */
  quantityDeltas: Array<{ postedAt: number; delta: Prisma.Decimal }>;
}

interface AssetKindTargetModel {
  kind: AssetKind;
  targetPercent: Prisma.Decimal;
}

@Injectable()
export class BrokerageService {
  private readonly logger = new Logger(BrokerageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
    private readonly assetsService: AssetsService,
    private readonly pricesService: PricesService,
    private readonly transactionsService: TransactionsService,
  ) {}

  async listBrokerageAccounts(
    ownerId: string,
  ): Promise<BrokerageAccountSummaryResponse[]> {
    return this.buildBrokerageSummaries(ownerId);
  }

  async getWorkspace(
    ownerId: string,
    accountId: string,
  ): Promise<BrokerageWorkspaceResponse> {
    const brokerAccountsPromise = this.listActiveBrokerAccounts(ownerId);
    const dashboardPromise = this.assetsService.getDashboard(ownerId);

    const [
      brokerAccounts,
      dashboard,
      operations,
      assetKindTargets,
      securityTargets,
    ] = await Promise.all([
      brokerAccountsPromise,
      dashboardPromise,
      this.findBrokerageOperationsSafe(
        ownerId,
        accountId,
        BROKERAGE_ACTIVITY_LIMIT,
      ),
      this.findPortfolioAssetKindTargetsSafe(ownerId),
      this.findPortfolioSecurityTargetsSafe(ownerId),
    ]);

    const summaries = this.buildBrokerageSummariesFromDashboard(
      brokerAccounts,
      new Map(),
      dashboard,
    );
    const selectedBroker = summaries.find(
      (summary) => summary.account.id === accountId,
    );

    if (!selectedBroker) {
      throw new NotFoundException(
        `Brokerage account ${accountId} was not found.`,
      );
    }

    const allAssets = dashboard.assets.filter(
      (asset) => asset.type === 'ASSET',
    );
    const selectedAssets = allAssets.filter(
      (asset) => asset.accountId === accountId,
    );
    const activePositions = selectedAssets.filter(
      (asset) =>
        asset.kind &&
        this.isMarketKind(asset.kind) &&
        (asset.quantity ?? 0) > 0,
    );
    const portfolioTotal = this.sumEffectiveValues(allAssets);
    const totalBrokerageValue = this.sumEffectiveValues(selectedAssets);
    const allocation = this.buildAllocationSnapshot({
      assets: allAssets,
      reportingCurrency: dashboard.reportingCurrency,
      portfolioTotal,
      assetKindTargets,
      securityTargets,
    });
    const positions = activePositions.map((asset) =>
      this.toBrokeragePositionResponse({
        asset,
        totalBrokerageValue,
        portfolioTotal,
        securityTargets,
        reportingCurrency: dashboard.reportingCurrency,
      }),
    );
    const mirroredTransactionIds = new Set(
      operations
        .map((operation) => operation.mirroredTransactionId)
        .filter((value): value is string => Boolean(value)),
    );
    const transactionEntries =
      await this.transactionsService.findRecentByAccount(ownerId, accountId, {
        includeArchivedAccounts: true,
        limit: BROKERAGE_ACTIVITY_LIMIT,
      });
    const transactionActivity = transactionEntries
      .filter(
        (entry) =>
          !this.isMirroredBrokerageCashflow(entry, mirroredTransactionIds),
      )
      .map((entry) => this.toBrokerageTransactionActivity(entry));
    const operationActivity = operations.map((operation) =>
      this.toBrokerageOperationActivity(operation),
    );
    const activity = [...operationActivity, ...transactionActivity].sort(
      (left, right) => right.postedAt.localeCompare(left.postedAt),
    );

    return {
      reportingCurrency: dashboard.reportingCurrency,
      pricingStatus: dashboard.pricingStatus,
      brokers: summaries,
      selectedBroker,
      cashReconciliation: null,
      positions,
      activity: activity.slice(0, BROKERAGE_ACTIVITY_LIMIT),
      allocation,
    };
  }

  async getPerformance(
    ownerId: string,
    accountId: string,
    range: BrokeragePerformanceRange,
  ): Promise<BrokeragePerformanceResponse> {
    const now = new Date();
    await this.getRequiredBrokerAccount(ownerId, accountId, this.prisma);
    const dashboard = await this.assetsService.getDashboard(ownerId);
    const reportingCurrency = dashboard.reportingCurrency;

    const activePositions = dashboard.assets.filter(
      (asset) =>
        asset.type === 'ASSET' &&
        asset.accountId === accountId &&
        asset.kind &&
        this.isMarketKind(asset.kind) &&
        (asset.quantity ?? 0) > 0,
    );

    if (activePositions.length === 0) {
      const asOf = now.toISOString();
      return {
        range,
        reportingCurrency,
        pricingStatus: this.buildEmptyPricingStatus(),
        points: [],
        baselineValue: null,
        latestValue: null,
        changeAbsolute: null,
        changePercent: null,
        asOf,
      };
    }

    const positionAssets = await this.prisma.asset.findMany({
      where: {
        id: { in: activePositions.map((asset) => asset.id) },
        userId: ownerId,
      },
    });
    const assetById = new Map(positionAssets.map((asset) => [asset.id, asset]));
    const maxStartCandidates = positionAssets.map((asset) =>
      asset.createdAt.getTime(),
    );
    const currentTotalValue = this.round2(
      this.sumEffectiveValues(activePositions),
    );

    const pricedViews = activePositions.filter(
      (asset) => !!asset.ticker && !!assetById.get(asset.id),
    );
    const manualViews = activePositions.filter((asset) => !asset.ticker);

    // Constant contribution from manual positions (no ticker -> no series).
    let constantTotal = this.toDecimal(
      manualViews.reduce(
        (sum, asset) => sum + (asset.currentValue ?? asset.referenceValue ?? 0),
        0,
      ),
    );

    // Fetch a price series for every priced position in parallel.
    const seriesResults = await Promise.all(
      pricedViews.map(async (asset) => {
        const record = assetById.get(asset.id)!;
        const series = await this.pricesService.getMarketSeries(
          {
            kind: asset.kind!,
            ticker: record.ticker!,
            exchange: record.exchange,
            quoteCurrency: record.currency,
          },
          range,
        );
        return { asset, record, series };
      }),
    );

    let hasFailedSeries = false;
    const reconstructable = seriesResults.filter(
      (
        entry,
      ): entry is (typeof seriesResults)[number] & {
        series: MarketSeries;
      } => {
        if (entry.series) {
          return true;
        }

        hasFailedSeries = true;
        constantTotal = constantTotal.plus(
          this.toDecimal(
            entry.asset.currentValue ?? entry.asset.referenceValue ?? 0,
          ),
        );
        return false;
      },
    );

    // Load operations for the reconstructable assets and build quantity
    // deltas: BUY adds, SELL subtracts.
    const assetIds = reconstructable.map((entry) => entry.record.id);
    const operations =
      assetIds.length === 0
        ? []
        : await this.prisma.brokerageOperation.findMany({
            where: {
              userId: ownerId,
              assetId: { in: assetIds },
              kind: {
                in: [BrokerageOperationKind.BUY, BrokerageOperationKind.SELL],
              },
              quantity: { not: null },
            },
            orderBy: { postedAt: 'asc' },
          });
    const opsByAsset = new Map<string, BrokerageOperation[]>();
    for (const operation of operations) {
      if (!operation.assetId || !operation.quantity) {
        continue;
      }

      maxStartCandidates.push(operation.postedAt.getTime());
      const list = opsByAsset.get(operation.assetId) ?? [];
      list.push(operation);
      opsByAsset.set(operation.assetId, list);
    }

    const pricedPositions: PerformancePricedPosition[] = reconstructable.map(
      (entry) => {
        const ops = opsByAsset.get(entry.record.id) ?? [];
        const quantityDeltas = ops.map((operation) => ({
          postedAt: operation.postedAt.getTime(),
          delta:
            operation.kind === BrokerageOperationKind.BUY
              ? this.toDecimal(operation.quantity)
              : ZERO.sub(this.toDecimal(operation.quantity)),
        }));

        return {
          assetId: entry.record.id,
          currency: entry.record.currency,
          currentQuantity: this.toDecimal(entry.record.quantity),
          series: entry.series,
          quantityDeltas,
        };
      },
    );

    // Fetch an FX series for every distinct non-reporting currency among the
    // reconstructable priced positions.
    const fxCurrencies = [
      ...new Set(
        pricedPositions
          .map((position) => position.currency)
          .filter((currency) => currency !== reportingCurrency),
      ),
    ];
    const fxSeriesByCurrency = new Map<string, MarketSeries | null>();
    const fxSnapshotByCurrency = new Map<string, StoredFxRateSnapshot>();
    await Promise.all(
      fxCurrencies.map(async (currency) => {
        const [series, snapshot] = await Promise.all([
          this.pricesService.getFxSeries(currency, reportingCurrency, range),
          this.pricesService.getStoredFxRateSnapshot(
            ownerId,
            now,
            currency,
            reportingCurrency,
          ),
        ]);
        fxSeriesByCurrency.set(currency, series);
        fxSnapshotByCurrency.set(currency, snapshot);
      }),
    );

    // An FX series gap is only a real problem if the stored snapshot fallback
    // is also stale or missing; an EXACT snapshot covers the gap cleanly.
    const hasStaleFx = fxCurrencies.some((currency) => {
      if (fxSeriesByCurrency.get(currency)) {
        return false;
      }

      return fxSnapshotByCurrency.get(currency)?.status === 'STALE';
    });
    const hasMissingFx = fxCurrencies.some((currency) => {
      if (fxSeriesByCurrency.get(currency)) {
        return false;
      }

      return (
        (fxSnapshotByCurrency.get(currency)?.status ?? 'MISSING') === 'MISSING'
      );
    });

    // Determine the range start and the time grid.
    const rangeStart = this.resolvePerformanceRangeStart(
      range,
      now,
      pricedPositions,
      fxSeriesByCurrency,
      maxStartCandidates,
    );
    const grid = this.buildPerformanceTimeGrid(
      rangeStart,
      now,
      pricedPositions,
      fxSeriesByCurrency,
    );

    const fxFallbackRate = (currency: string): Prisma.Decimal =>
      this.toDecimal(fxSnapshotByCurrency.get(currency)?.rate ?? 1);

    const points: BrokeragePerformancePointResponse[] = grid.map((t) => {
      let total = constantTotal;

      for (const position of pricedPositions) {
        const quantity = this.quantityAt(position, t);
        const price = this.seriesValueAt(position.series, t);
        const fx =
          position.currency === reportingCurrency
            ? ZERO.add(1)
            : this.fxValueAt(
                fxSeriesByCurrency.get(position.currency) ?? null,
                t,
                fxFallbackRate(position.currency),
              );

        total = total.plus(quantity.mul(price).mul(fx));
      }

      return { t, value: this.round2(total.toNumber()) };
    });

    const downsampled = this.withCurrentPerformancePoint(
      this.downsamplePoints(points, PERFORMANCE_MAX_POINTS),
      { t: now.getTime(), value: currentTotalValue },
      PERFORMANCE_MAX_POINTS,
    );

    // Baseline.
    let baselineValue: number | null = null;
    if (range === '1D') {
      let hasPreviousClose = pricedPositions.length > 0;
      let baselineTotal = constantTotal;

      for (const position of pricedPositions) {
        if (position.series.previousClose === null) {
          hasPreviousClose = false;
          break;
        }

        const fx =
          position.currency === reportingCurrency
            ? ZERO.add(1)
            : this.fxValueAt(
                fxSeriesByCurrency.get(position.currency) ?? null,
                now.getTime(),
                fxFallbackRate(position.currency),
              );

        baselineTotal = baselineTotal.plus(
          position.currentQuantity
            .mul(new Prisma.Decimal(position.series.previousClose.toString()))
            .mul(fx),
        );
      }

      baselineValue = hasPreviousClose
        ? this.round2(baselineTotal.toNumber())
        : (downsampled[0]?.value ?? null);
    } else {
      baselineValue = downsampled[0]?.value ?? null;
    }

    const latestValue = downsampled[downsampled.length - 1]?.value ?? null;
    const changeAbsolute =
      latestValue !== null && baselineValue !== null
        ? this.round2(latestValue - baselineValue)
        : null;
    const changePercent =
      changeAbsolute !== null && baselineValue !== null && baselineValue > 0
        ? this.round2((changeAbsolute / baselineValue) * 100)
        : null;

    return {
      range,
      reportingCurrency,
      pricingStatus: this.buildPerformancePricingStatus(
        hasFailedSeries,
        hasStaleFx,
        hasMissingFx,
      ),
      points: downsampled,
      baselineValue,
      latestValue,
      changeAbsolute,
      changePercent,
      asOf: now.toISOString(),
    };
  }

  async createBuy(
    ownerId: string,
    accountId: string,
    input: CreateBrokerageBuyRequest,
  ): Promise<BrokerageOperationResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.getRequiredBrokerAccount(
          ownerId,
          accountId,
          tx,
        );
        const postedAt = this.parsePostedAt(input.postedAt);
        this.accountsService.assertPostedAtAllowed(account, postedAt);
        const quantity = this.toPositiveDecimal(
          input.quantity,
          'Quantity is required.',
        );
        const unitPrice = this.toPositiveDecimal(
          input.unitPrice,
          'Unit price is required.',
        );
        const feeAmount = this.toOptionalNonNegativeDecimal(input.feeAmount);
        const grossAmount = quantity.mul(unitPrice);
        const cashAmount = grossAmount.add(feeAmount);
        const signedCashAmount = ZERO.sub(cashAmount);
        const kind = this.requireMarketKind(input.kind);
        const requestedCurrency = this.normalizeCurrency(input.currency);

        const existingAsset = input.assetId
          ? await this.getRequiredBrokerageAsset(
              ownerId,
              accountId,
              input.assetId,
              tx,
            )
          : await this.findExistingHoldingByIdentity(
              ownerId,
              accountId,
              {
                kind,
                ticker: input.ticker ?? null,
                exchange: input.exchange ?? null,
              },
              tx,
            );
        const operationCurrency = existingAsset?.currency ?? requestedCurrency;

        await this.transactionsService.applyAccountCashMovement(
          ownerId,
          account.id,
          cashAmount,
          TransactionDirection.OUTFLOW,
          tx,
        );

        let asset: Asset;
        if (existingAsset) {
          asset = await this.applyBuyToExistingAsset(
            existingAsset,
            quantity,
            grossAmount,
            feeAmount,
            tx,
          );
        } else {
          asset = await this.createNewHolding(
            ownerId,
            account,
            input,
            quantity,
            grossAmount,
            feeAmount,
            tx,
          );
        }

        const operation = await tx.brokerageOperation.create({
          data: {
            userId: ownerId,
            accountId: account.id,
            assetId: asset.id,
            kind: BrokerageOperationKind.BUY,
            postedAt,
            currency: operationCurrency,
            quantity,
            unitPrice,
            grossAmount,
            feeAmount,
            cashAmount: signedCashAmount,
            realisedGainLoss: null,
            notes: this.optionalText(input.notes),
            mirroredTransactionId: null,
          },
        });

        return this.toBrokerageOperationResponse(operation);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createSell(
    ownerId: string,
    accountId: string,
    input: CreateBrokerageSellRequest,
  ): Promise<BrokerageOperationResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.getRequiredBrokerAccount(
          ownerId,
          accountId,
          tx,
        );
        const postedAt = this.parsePostedAt(input.postedAt);
        this.accountsService.assertPostedAtAllowed(account, postedAt);
        const asset = await this.getRequiredBrokerageAsset(
          ownerId,
          accountId,
          input.assetId,
          tx,
        );
        const quantity = this.toPositiveDecimal(
          input.quantity,
          'Quantity is required.',
        );
        const unitPrice = this.toPositiveDecimal(
          input.unitPrice,
          'Unit price is required.',
        );
        const feeAmount = this.toOptionalNonNegativeDecimal(input.feeAmount);
        const existingQuantity = this.toDecimal(asset.quantity);
        const existingUnitPrice = this.toDecimal(asset.unitPrice);

        if (existingQuantity.lt(quantity)) {
          throw new ConflictException(
            'Cannot sell more than the current position quantity.',
          );
        }

        const grossAmount = quantity.mul(unitPrice);
        const cashAmount = grossAmount.sub(feeAmount);
        const soldCostBasis = quantity.mul(existingUnitPrice);
        const remainingQuantity = existingQuantity.sub(quantity);
        const remainingBalance = remainingQuantity.mul(existingUnitPrice);
        const realisedGainLoss = cashAmount.sub(soldCostBasis);

        await this.transactionsService.applyAccountCashMovement(
          ownerId,
          accountId,
          cashAmount,
          TransactionDirection.INFLOW,
          tx,
        );

        await tx.asset.update({
          where: { id: asset.id },
          data: {
            quantity: remainingQuantity,
            balance: remainingBalance,
            unitPrice: existingUnitPrice,
          },
        });

        const operation = await tx.brokerageOperation.create({
          data: {
            userId: ownerId,
            accountId,
            assetId: asset.id,
            kind: BrokerageOperationKind.SELL,
            postedAt,
            currency: asset.currency,
            quantity,
            unitPrice,
            grossAmount,
            feeAmount,
            cashAmount,
            realisedGainLoss,
            notes: this.optionalText(input.notes),
            mirroredTransactionId: null,
          },
        });

        return this.toBrokerageOperationResponse(operation);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createDividend(
    ownerId: string,
    accountId: string,
    input: CreateBrokerageDividendRequest,
  ): Promise<BrokerageOperationResponse> {
    return this.createMirroredCashOperation(
      ownerId,
      accountId,
      input,
      BrokerageOperationKind.DIVIDEND,
      TransactionKind.INCOME,
      TransactionDirection.INFLOW,
      'Brokerage dividend',
    );
  }

  async createFee(
    ownerId: string,
    accountId: string,
    input: CreateBrokerageFeeRequest,
  ): Promise<BrokerageOperationResponse> {
    return this.createMirroredCashOperation(
      ownerId,
      accountId,
      input,
      BrokerageOperationKind.FEE,
      TransactionKind.EXPENSE,
      TransactionDirection.OUTFLOW,
      'Brokerage fee',
    );
  }

  async updateAllocationTargets(
    ownerId: string,
    input: UpdatePortfolioAllocationTargetsRequest,
  ): Promise<PortfolioAllocationTargetsResponse> {
    const assetKindTargets: AssetKindTargetModel[] = input.assetKindTargets.map(
      (entry) => ({
        kind: entry.kind,
        targetPercent: this.toNonNegativeDecimal(entry.targetPercent),
      }),
    );
    const securityTargets: SecurityTargetModel[] = input.securityTargets.map(
      (entry) => ({
        kind: this.requireMarketKind(entry.kind),
        ticker: this.normalizeTicker(entry.ticker),
        exchange: this.normalizeExchange(entry.kind, entry.exchange ?? null),
        name: this.optionalText(entry.name),
        targetPercent: this.toNonNegativeDecimal(entry.targetPercent),
      }),
    );

    this.assertNoDuplicateAssetKindTargets(assetKindTargets);
    this.assertNoDuplicateSecurityTargets(securityTargets);
    this.assertTargetsSumToHundred(
      assetKindTargets.map((entry) => entry.targetPercent),
    );
    this.assertTargetsSumToHundred(
      securityTargets.map((entry) => entry.targetPercent),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.portfolioAssetKindTarget.deleteMany({
        where: { userId: ownerId },
      });
      await tx.portfolioSecurityTarget.deleteMany({
        where: { userId: ownerId },
      });

      if (assetKindTargets.length > 0) {
        await tx.portfolioAssetKindTarget.createMany({
          data: assetKindTargets.map((entry) => ({
            userId: ownerId,
            kind: entry.kind,
            targetPercent: entry.targetPercent,
          })),
        });
      }

      if (securityTargets.length > 0) {
        await tx.portfolioSecurityTarget.createMany({
          data: securityTargets.map((entry) => ({
            userId: ownerId,
            kind: entry.kind,
            ticker: entry.ticker,
            exchange: entry.exchange,
            name: entry.name,
            targetPercent: entry.targetPercent,
          })),
        });
      }
    });

    return {
      assetKindTargets: assetKindTargets.map((entry) => ({
        kind: entry.kind,
        targetPercent: entry.targetPercent.toNumber(),
      })),
      securityTargets: securityTargets.map((entry) => ({
        kind: entry.kind,
        ticker: entry.ticker,
        exchange: entry.exchange || null,
        name: entry.name,
        targetPercent: entry.targetPercent.toNumber(),
      })),
    };
  }

  private async createMirroredCashOperation(
    ownerId: string,
    accountId: string,
    input: CreateBrokerageDividendRequest | CreateBrokerageFeeRequest,
    operationKind: BrokerageOperationKind,
    transactionKind: TransactionKind,
    direction: TransactionDirection,
    description: string,
  ): Promise<BrokerageOperationResponse> {
    return this.prisma.$transaction(
      async (tx) => {
        const account = await this.getRequiredBrokerAccount(
          ownerId,
          accountId,
          tx,
        );
        const asset = input.assetId
          ? await this.getRequiredBrokerageAsset(
              ownerId,
              account.id,
              input.assetId,
              tx,
            )
          : null;
        const amount = this.toPositiveDecimal(
          input.amount,
          'Amount is required.',
        );
        const postedAt = this.parsePostedAt(input.postedAt);
        const transaction = await this.transactionsService.create(
          ownerId,
          {
            postedAt: input.postedAt,
            kind: transactionKind,
            amount: amount.toNumber(),
            description,
            notes: input.notes ?? null,
            accountId: account.id,
            direction,
            categoryId: input.categoryId,
            counterparty: asset?.name ?? null,
          },
          tx,
        );

        const transactionId =
          transaction.entryType === 'STANDARD' ? transaction.row.id : null;
        const operation = await tx.brokerageOperation.create({
          data: {
            userId: ownerId,
            accountId: account.id,
            assetId: asset?.id ?? null,
            kind: operationKind,
            postedAt,
            currency: account.currency,
            quantity: null,
            unitPrice: null,
            grossAmount: amount,
            feeAmount: null,
            cashAmount:
              direction === TransactionDirection.INFLOW
                ? amount
                : ZERO.sub(amount),
            realisedGainLoss: null,
            notes: this.optionalText(input.notes),
            mirroredTransactionId: transactionId,
          },
        });

        return this.toBrokerageOperationResponse(operation);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async buildBrokerageSummaries(
    ownerId: string,
  ): Promise<BrokerageAccountSummaryResponse[]> {
    const brokerAccounts = await this.listActiveBrokerAccounts(ownerId);
    const dashboard = await this.assetsService.getDashboard(ownerId);

    return this.buildBrokerageSummariesFromDashboard(
      brokerAccounts,
      new Map(),
      dashboard,
    );
  }

  private async listActiveBrokerAccounts(ownerId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: { userId: ownerId, type: AccountType.BROKER, archivedAt: null },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private buildBrokerageSummariesFromDashboard(
    brokerAccounts: Account[],
    deletionStates: Map<string, AccountDeletionState>,
    dashboard: Awaited<ReturnType<AssetsService['getDashboard']>>,
  ): BrokerageAccountSummaryResponse[] {
    return brokerAccounts.map((account) => {
      const assignedAssets = dashboard.assets.filter(
        (asset) => asset.type === 'ASSET' && asset.accountId === account.id,
      );
      const cashAvailable = this.sumEffectiveValues(
        assignedAssets.filter((asset) => asset.kind === AssetKind.CASH),
      );
      const investedAssets = assignedAssets.filter(
        (asset) =>
          asset.kind &&
          this.isMarketKind(asset.kind) &&
          (asset.quantity ?? 0) > 0,
      );
      const investedValue = this.sumEffectiveValues(investedAssets);
      const totalValue = this.sumEffectiveValues(assignedAssets);
      const unrealisedGainLoss = investedAssets.reduce((sum, asset) => {
        const currentValue = this.effectiveValue(asset);
        const costBasis = asset.referenceValue ?? 0;
        return sum + (currentValue - costBasis);
      }, 0);

      return {
        account: toAccountResponse(account, deletionStates.get(account.id)),
        totalValue,
        cashAvailable,
        investedValue,
        unrealisedGainLoss,
        activePositionCount: investedAssets.length,
      };
    });
  }

  private buildAllocationSnapshot(input: {
    assets: DashboardAssetView[];
    reportingCurrency: string;
    portfolioTotal: number;
    assetKindTargets: { kind: AssetKind; targetPercent: Prisma.Decimal }[];
    securityTargets: SecurityTargetModel[];
  }): PortfolioAllocationSnapshotResponse {
    const byKind = new Map<
      AssetKind,
      { label: string; currentValue: number }
    >();
    const bySecurity = new Map<
      string,
      {
        label: string;
        currentValue: number;
        kind: AssetKind;
        ticker: string;
        exchange: string;
      }
    >();

    for (const asset of input.assets) {
      if (asset.type !== 'ASSET' || !asset.kind) {
        continue;
      }

      const currentValue = this.effectiveValue(asset);
      const nextKindValue =
        (byKind.get(asset.kind)?.currentValue ?? 0) + currentValue;
      byKind.set(asset.kind, {
        label: KIND_LABELS[asset.kind] ?? asset.kind,
        currentValue: nextKindValue,
      });

      if (
        !this.isMarketKind(asset.kind) ||
        !asset.ticker ||
        (asset.quantity ?? 0) <= 0
      ) {
        continue;
      }

      const key = this.securityKey(
        asset.kind,
        asset.ticker,
        asset.exchange ?? '',
      );
      const existing = bySecurity.get(key);
      bySecurity.set(key, {
        label: asset.name,
        currentValue: (existing?.currentValue ?? 0) + currentValue,
        kind: asset.kind,
        ticker: asset.ticker,
        exchange: asset.exchange ?? '',
      });
    }

    const assetKindRows = this.buildAssetKindAllocationRows(
      byKind,
      input.assetKindTargets,
      input.portfolioTotal,
    );
    const securityRows = this.buildSecurityAllocationRows(
      bySecurity,
      input.securityTargets,
      input.portfolioTotal,
    );

    return {
      assetKindTargets: assetKindRows,
      securityTargets: securityRows,
    };
  }

  private buildAssetKindAllocationRows(
    byKind: Map<AssetKind, { label: string; currentValue: number }>,
    targets: { kind: AssetKind; targetPercent: Prisma.Decimal }[],
    portfolioTotal: number,
  ): PortfolioAllocationSnapshotItemResponse[] {
    const rows = new Map<string, PortfolioAllocationSnapshotItemResponse>();

    for (const [kind, value] of byKind.entries()) {
      const currentPercent =
        portfolioTotal > 0 ? (value.currentValue / portfolioTotal) * 100 : null;
      rows.set(kind, {
        key: kind,
        label: value.label,
        kind,
        ticker: null,
        exchange: null,
        currentValue: value.currentValue,
        currentPercent,
        targetPercent: null,
        deltaPercent: null,
        deltaValue: null,
      });
    }

    for (const target of targets) {
      const existing = rows.get(target.kind) ?? {
        key: target.kind,
        label: KIND_LABELS[target.kind] ?? target.kind,
        kind: target.kind,
        ticker: null,
        exchange: null,
        currentValue: 0,
        currentPercent: portfolioTotal > 0 ? 0 : null,
        targetPercent: null,
        deltaPercent: null,
        deltaValue: null,
      };
      existing.targetPercent = target.targetPercent.toNumber();
      existing.deltaPercent =
        existing.currentPercent === null
          ? null
          : existing.targetPercent - existing.currentPercent;
      existing.deltaValue =
        existing.targetPercent === null
          ? null
          : (portfolioTotal * existing.targetPercent) / 100 -
            existing.currentValue;
      rows.set(target.kind, existing);
    }

    return [...rows.values()].sort(
      (left, right) => right.currentValue - left.currentValue,
    );
  }

  private buildSecurityAllocationRows(
    bySecurity: Map<
      string,
      {
        label: string;
        currentValue: number;
        kind: AssetKind;
        ticker: string;
        exchange: string;
      }
    >,
    targets: SecurityTargetModel[],
    portfolioTotal: number,
  ): PortfolioAllocationSnapshotItemResponse[] {
    const rows = new Map<string, PortfolioAllocationSnapshotItemResponse>();

    for (const [key, value] of bySecurity.entries()) {
      const currentPercent =
        portfolioTotal > 0 ? (value.currentValue / portfolioTotal) * 100 : null;
      rows.set(key, {
        key,
        label: value.label,
        kind: value.kind,
        ticker: value.ticker,
        exchange: value.exchange || null,
        currentValue: value.currentValue,
        currentPercent,
        targetPercent: null,
        deltaPercent: null,
        deltaValue: null,
      });
    }

    for (const target of targets) {
      const key = this.securityKey(target.kind, target.ticker, target.exchange);
      const existing = rows.get(key) ?? {
        key,
        label: target.name ?? `${target.ticker}${target.exchange}`,
        kind: target.kind,
        ticker: target.ticker,
        exchange: target.exchange || null,
        currentValue: 0,
        currentPercent: portfolioTotal > 0 ? 0 : null,
        targetPercent: null,
        deltaPercent: null,
        deltaValue: null,
      };
      existing.targetPercent = target.targetPercent.toNumber();
      existing.deltaPercent =
        existing.currentPercent === null
          ? null
          : existing.targetPercent - existing.currentPercent;
      existing.deltaValue =
        existing.targetPercent === null
          ? null
          : (portfolioTotal * existing.targetPercent) / 100 -
            existing.currentValue;
      rows.set(key, existing);
    }

    return [...rows.values()].sort(
      (left, right) => right.currentValue - left.currentValue,
    );
  }

  private toBrokeragePositionResponse(input: {
    asset: DashboardAssetView;
    totalBrokerageValue: number;
    portfolioTotal: number;
    securityTargets: SecurityTargetModel[];
    reportingCurrency: string;
  }): BrokeragePositionResponse {
    const asset = input.asset;
    const currentValue = asset.currentValue ?? asset.referenceValue ?? null;
    const currentPrice = asset.lastPrice ?? asset.unitPrice ?? null;
    const costBasis = asset.referenceValue ?? asset.balance;
    const unrealisedGainLoss =
      currentValue === null ? null : currentValue - costBasis;
    const percentOfBrokerage =
      currentValue === null || input.totalBrokerageValue <= 0
        ? null
        : (currentValue / input.totalBrokerageValue) * 100;
    const percentOfPortfolio =
      currentValue === null || input.portfolioTotal <= 0
        ? null
        : (currentValue / input.portfolioTotal) * 100;
    const target = input.securityTargets.find(
      (entry) =>
        entry.kind === asset.kind &&
        entry.ticker === (asset.ticker ?? '') &&
        entry.exchange === (asset.exchange ?? ''),
    );
    const targetPercent = target?.targetPercent.toNumber() ?? null;
    const deltaPercent =
      targetPercent === null || percentOfPortfolio === null
        ? null
        : targetPercent - percentOfPortfolio;
    const deltaValue =
      targetPercent === null || currentValue === null
        ? null
        : (input.portfolioTotal * targetPercent) / 100 - currentValue;

    return {
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind!,
      ticker: asset.ticker,
      exchange: asset.exchange,
      currency: asset.currency,
      quantity: asset.quantity ?? 0,
      averageCostPerUnit: asset.unitPrice ?? 0,
      costBasis,
      currentPrice,
      currentValue,
      unrealisedGainLoss,
      percentOfBrokerage,
      percentOfPortfolio,
      targetPercent,
      deltaPercent,
      deltaValue,
      valuationSource: asset.valuationSource,
      valuationAsOf: asset.valuationAsOf,
      isStale: asset.isStale,
    };
  }

  private toBrokerageOperationActivity(
    operation: BrokerageOperation & { asset?: Asset | null },
  ): BrokerageActivityItemResponse {
    const amount = operation.cashAmount.toNumber();
    return {
      id: operation.id,
      source: 'BROKERAGE_OPERATION',
      kind: operation.kind,
      postedAt: operation.postedAt.toISOString(),
      title: this.operationTitle(operation.kind),
      detail:
        operation.asset?.name ??
        (operation.kind === BrokerageOperationKind.DIVIDEND
          ? 'Cash dividend'
          : operation.kind === BrokerageOperationKind.FEE
            ? 'Brokerage fee'
            : null),
      amount,
      currency: operation.currency,
      notes: operation.notes,
      assetId: operation.assetId ?? null,
      assetName: operation.asset?.name ?? null,
      quantity: operation.quantity?.toNumber() ?? null,
      unitPrice: operation.unitPrice?.toNumber() ?? null,
      feeAmount: operation.feeAmount?.toNumber() ?? null,
      transactionId: operation.mirroredTransactionId ?? null,
    };
  }

  private toBrokerageTransactionActivity(
    entry: LogicalTransactionEntry,
  ): BrokerageActivityItemResponse {
    if (entry.entryType === 'TRANSFER') {
      const response = toTransactionResponse(entry);
      return {
        id: response.id,
        source: 'TRANSACTION',
        kind: 'TRANSFER',
        postedAt: response.postedAt,
        title: 'Transfer',
        detail: response.description,
        amount:
          entry.outflow.accountId === response.sourceAccountId
            ? -response.amount
            : response.amount,
        currency: response.currency,
        notes: response.notes,
        assetId: null,
        assetName: null,
        quantity: null,
        unitPrice: null,
        feeAmount: null,
        transactionId: response.id,
      };
    }

    const response = toTransactionResponse(entry);
    const amount =
      response.direction === 'OUTFLOW' ? -response.amount : response.amount;
    return {
      id: response.id,
      source: 'TRANSACTION',
      kind: response.kind,
      postedAt: response.postedAt,
      title: response.description,
      detail:
        response.secondaryCategoryName ??
        response.primaryCategoryName ??
        response.counterparty,
      amount,
      currency: response.currency,
      notes: response.notes,
      assetId: null,
      assetName: null,
      quantity: null,
      unitPrice: null,
      feeAmount: null,
      transactionId: response.id,
    };
  }

  private async getRequiredBrokerAccount(
    ownerId: string,
    accountId: string,
    client: BrokerageReadClient,
  ): Promise<Account> {
    const account = await client.account.findFirst({
      where: {
        id: accountId,
        userId: ownerId,
        type: AccountType.BROKER,
        archivedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException(
        `Brokerage account ${accountId} was not found.`,
      );
    }

    return account;
  }

  private async getRequiredBrokerageAsset(
    ownerId: string,
    accountId: string,
    assetId: string,
    client: BrokerageReadClient,
  ): Promise<Asset> {
    const asset = await client.asset.findFirst({
      where: { id: assetId, userId: ownerId, accountId },
    });

    if (!asset) {
      throw new NotFoundException(
        `Brokerage position ${assetId} was not found.`,
      );
    }

    if (
      asset.type !== AssetType.ASSET ||
      !asset.kind ||
      !this.isMarketKind(asset.kind)
    ) {
      throw new BadRequestException(
        'Only market positions can be used for brokerage operations.',
      );
    }

    return asset;
  }

  private async findExistingHoldingByIdentity(
    ownerId: string,
    accountId: string,
    input: {
      kind: AssetKind;
      ticker: string | null;
      exchange: string | null;
    },
    client: BrokerageReadClient,
  ): Promise<Asset | null> {
    if (!input.ticker) {
      return null;
    }

    return client.asset.findFirst({
      where: {
        userId: ownerId,
        accountId,
        type: AssetType.ASSET,
        kind: input.kind,
        ticker: this.normalizeTicker(input.ticker),
        exchange: this.normalizeExchange(input.kind, input.exchange),
      },
    });
  }

  private async applyBuyToExistingAsset(
    asset: Asset,
    quantity: Prisma.Decimal,
    grossAmount: Prisma.Decimal,
    feeAmount: Prisma.Decimal,
    tx: BrokerageWriteClient,
  ): Promise<Asset> {
    const nextQuantity = this.toDecimal(asset.quantity).add(quantity);
    const nextCostBasis = asset.balance.add(grossAmount).add(feeAmount);
    const nextAverageCost = nextQuantity.eq(ZERO)
      ? ZERO
      : nextCostBasis.div(nextQuantity);

    return tx.asset.update({
      where: { id: asset.id },
      data: {
        quantity: nextQuantity,
        balance: nextCostBasis,
        unitPrice: nextAverageCost,
      },
    });
  }

  private async createNewHolding(
    ownerId: string,
    account: Account,
    input: CreateBrokerageBuyRequest,
    quantity: Prisma.Decimal,
    grossAmount: Prisma.Decimal,
    feeAmount: Prisma.Decimal,
    tx: BrokerageWriteClient,
  ): Promise<Asset> {
    const name = this.requireText(input.name, 'Holding name is required.');
    const ticker = this.requireText(input.ticker, 'Ticker is required.');
    const averageCost = grossAmount.add(feeAmount).div(quantity);

    return tx.asset.create({
      data: {
        userId: ownerId,
        accountId: account.id,
        name,
        type: AssetType.ASSET,
        kind: this.requireMarketKind(input.kind),
        liabilityKind: null,
        ticker: this.normalizeTicker(ticker),
        exchange: this.normalizeExchange(input.kind, input.exchange ?? null),
        quantity,
        unitPrice: averageCost,
        balance: grossAmount.add(feeAmount),
        currency: this.normalizeCurrency(input.currency),
        notes: this.optionalText(input.notes),
        order: 0,
      },
    });
  }

  private isMirroredBrokerageCashflow(
    entry: LogicalTransactionEntry,
    mirroredTransactionIds: Set<string>,
  ): boolean {
    if (entry.entryType === 'TRANSFER') {
      return false;
    }

    if (entry.entryType === 'SPLIT') {
      return entry.rows.some((row) => mirroredTransactionIds.has(row.id));
    }

    return mirroredTransactionIds.has(entry.row.id);
  }

  private sumEffectiveValues(assets: DashboardAssetView[]): number {
    return assets.reduce((sum, asset) => sum + this.effectiveValue(asset), 0);
  }

  private effectiveValue(
    asset: Pick<DashboardAssetView, 'currentValue' | 'referenceValue'>,
  ): number {
    return asset.currentValue ?? asset.referenceValue ?? 0;
  }

  private buildEmptyPricingStatus(): AggregatePricingStatus {
    return {
      state: 'FRESH',
      refreshSuggested: false,
      hasStaleQuotes: false,
      hasStaleFx: false,
      hasMissingFx: false,
    };
  }

  private buildPerformancePricingStatus(
    hasFailedSeries: boolean,
    hasStaleFx: boolean,
    hasMissingFx: boolean,
  ): AggregatePricingStatus {
    const state =
      hasFailedSeries || hasMissingFx
        ? 'PARTIAL'
        : hasStaleFx
          ? 'STALE'
          : 'FRESH';

    return {
      state,
      refreshSuggested: state !== 'FRESH',
      hasStaleQuotes: hasFailedSeries,
      hasStaleFx,
      hasMissingFx,
    };
  }

  /**
   * Resolves the start of the requested range. For MAX, this is the
   * earliest timestamp among all fetched series (falling back to `now` if
   * no series produced any points).
   */
  private resolvePerformanceRangeStart(
    range: BrokeragePerformanceRange,
    now: Date,
    pricedPositions: PerformancePricedPosition[],
    fxSeriesByCurrency: Map<string, MarketSeries | null>,
    fallbackStartCandidates: number[],
  ): number {
    if (range !== 'MAX') {
      const start = new Date(now);
      switch (range) {
        case '1D':
          start.setDate(start.getDate() - 1);
          break;
        case '1W':
          start.setDate(start.getDate() - 7);
          break;
        case '1M':
          start.setMonth(start.getMonth() - 1);
          break;
        case '1Y':
          start.setFullYear(start.getFullYear() - 1);
          break;
      }

      return start.getTime();
    }

    const allFirstPoints = [
      ...pricedPositions.map((position) => position.series.points[0]?.t),
      ...[...fxSeriesByCurrency.values()]
        .filter((series): series is MarketSeries => !!series)
        .map((series) => series.points[0]?.t),
      ...fallbackStartCandidates,
    ].filter((t): t is number => typeof t === 'number');

    if (allFirstPoints.length === 0) {
      return now.getTime();
    }

    return Math.min(...allFirstPoints);
  }

  /** Sorted union of all fetched series timestamps, clipped to [rangeStart, now]. */
  private buildPerformanceTimeGrid(
    rangeStart: number,
    now: Date,
    pricedPositions: PerformancePricedPosition[],
    fxSeriesByCurrency: Map<string, MarketSeries | null>,
  ): number[] {
    const nowMs = now.getTime();
    const effectiveRangeStart =
      rangeStart < nowMs ? rangeStart : nowMs - 60_000;
    const timestamps = new Set<number>();

    timestamps.add(effectiveRangeStart);
    timestamps.add(nowMs);

    for (const position of pricedPositions) {
      for (const point of position.series.points) {
        if (point.t >= effectiveRangeStart && point.t <= nowMs) {
          timestamps.add(point.t);
        }
      }
    }

    for (const series of fxSeriesByCurrency.values()) {
      if (!series) {
        continue;
      }

      for (const point of series.points) {
        if (point.t >= effectiveRangeStart && point.t <= nowMs) {
          timestamps.add(point.t);
        }
      }
    }

    return [...timestamps].sort((left, right) => left - right);
  }

  /**
   * Quantity of a position at time `t`, reconstructed by reversing
   * BUY/SELL operations posted after `t`. Clamped to zero.
   */
  private quantityAt(
    position: PerformancePricedPosition,
    t: number,
  ): Prisma.Decimal {
    let removed = ZERO;
    for (const { postedAt, delta } of position.quantityDeltas) {
      if (postedAt > t) {
        removed = removed.plus(delta);
      }
    }

    const quantity = position.currentQuantity.sub(removed);
    return quantity.lt(ZERO) ? ZERO : quantity;
  }

  /**
   * Price at time `t`: forward-filled from the last point <= t, or
   * backward-filled from the first point if `t` precedes all data.
   */
  private seriesValueAt(series: MarketSeries, t: number): Prisma.Decimal {
    let candidate: number | null = null;

    for (const point of series.points) {
      if (point.t <= t) {
        candidate = point.price;
      } else {
        break;
      }
    }

    if (candidate === null) {
      candidate = series.points[0]?.price ?? 0;
    }

    return new Prisma.Decimal(candidate.toString());
  }

  /** FX rate at time `t`, falling back to `fallback` when no series is available. */
  private fxValueAt(
    series: MarketSeries | null,
    t: number,
    fallback: Prisma.Decimal,
  ): Prisma.Decimal {
    if (!series) {
      return fallback;
    }

    return this.seriesValueAt(series, t);
  }

  /** Uniformly downsamples to at most `maxPoints`, always keeping the last point. */
  private downsamplePoints(
    points: BrokeragePerformancePointResponse[],
    maxPoints: number,
  ): BrokeragePerformancePointResponse[] {
    if (points.length <= maxPoints) {
      return points;
    }

    const step = points.length / maxPoints;
    const result: BrokeragePerformancePointResponse[] = [];
    for (let i = 0; i < maxPoints; i += 1) {
      result.push(points[Math.floor(i * step)]);
    }

    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) {
      result[result.length - 1] = last;
    }

    return result;
  }

  private withCurrentPerformancePoint(
    points: BrokeragePerformancePointResponse[],
    currentPoint: BrokeragePerformancePointResponse,
    maxPoints: number,
  ): BrokeragePerformancePointResponse[] {
    if (points.length === 0) {
      return [currentPoint];
    }

    const last = points[points.length - 1];
    if (currentPoint.t <= last.t) {
      return [...points.slice(0, -1), currentPoint];
    }

    if (points.length >= maxPoints) {
      return [...points.slice(0, -1), currentPoint];
    }

    return [...points, currentPoint];
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private operationTitle(kind: BrokerageOperationKind): string {
    switch (kind) {
      case BrokerageOperationKind.BUY:
        return 'Buy';
      case BrokerageOperationKind.SELL:
        return 'Sell';
      case BrokerageOperationKind.DIVIDEND:
        return 'Dividend';
      case BrokerageOperationKind.FEE:
        return 'Fee';
      default:
        return kind;
    }
  }

  private assertTargetsSumToHundred(values: Prisma.Decimal[]): void {
    if (values.length === 0) {
      return;
    }

    const sum = values.reduce((acc, value) => acc.add(value), ZERO);
    if (!sum.eq(HUNDRED)) {
      throw new BadRequestException('Target percentages must sum to 100%.');
    }
  }

  private assertNoDuplicateAssetKindTargets(
    targets: AssetKindTargetModel[],
  ): void {
    const seen = new Set<AssetKind>();
    const duplicates = new Set<AssetKind>();

    for (const target of targets) {
      if (seen.has(target.kind)) {
        duplicates.add(target.kind);
        continue;
      }

      seen.add(target.kind);
    }

    if (duplicates.size > 0) {
      throw new BadRequestException(
        `Duplicate asset-class targets are not allowed: ${[...duplicates].join(', ')}.`,
      );
    }
  }

  private assertNoDuplicateSecurityTargets(
    targets: SecurityTargetModel[],
  ): void {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    for (const target of targets) {
      const key = this.securityKey(target.kind, target.ticker, target.exchange);

      if (seen.has(key)) {
        duplicates.add(key);
        continue;
      }

      seen.add(key);
    }

    if (duplicates.size > 0) {
      const duplicateLabels = [...duplicates].map((key) => {
        const [kind, ticker, exchange] = key.split(':');
        return exchange ? `${kind}:${ticker}:${exchange}` : `${kind}:${ticker}`;
      });

      throw new BadRequestException(
        `Duplicate security targets are not allowed: ${duplicateLabels.join(', ')}.`,
      );
    }
  }

  private securityKey(
    kind: AssetKind,
    ticker: string,
    exchange: string,
  ): string {
    return `${kind}:${ticker}:${exchange}`;
  }

  private isMarketKind(kind: AssetKind): boolean {
    return MARKET_KINDS.has(kind);
  }

  private requireMarketKind(kind: AssetKind): AssetKind {
    if (!this.isMarketKind(kind)) {
      throw new BadRequestException(
        'Brokerage trades only support market asset kinds in this version.',
      );
    }

    return kind;
  }

  private normalizeTicker(ticker: string): string {
    return ticker.trim().toUpperCase();
  }

  private normalizeExchange(kind: AssetKind, exchange: string | null): string {
    const normalized = (exchange ?? '').trim().toUpperCase();

    if (kind === AssetKind.CRYPTO) {
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

  private normalizeCurrency(currency: string): string {
    const normalized = currency.trim().toUpperCase();
    if (!isSupportedCurrencyCode(normalized)) {
      throw new BadRequestException(`Unsupported currency code "${currency}".`);
    }

    return normalized;
  }

  private parsePostedAt(value: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('postedAt is invalid.');
    }

    return parsed;
  }

  private requireText(
    value: string | null | undefined,
    message: string,
  ): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(message);
    }

    return trimmed;
  }

  private optionalText(value: string | null | undefined): string | null {
    return value?.trim() || null;
  }

  private toDecimal(
    value: Prisma.Decimal | number | string | null | undefined,
  ): Prisma.Decimal {
    return value instanceof Prisma.Decimal
      ? value
      : new Prisma.Decimal(value ?? 0);
  }

  private toPositiveDecimal(value: number, message: string): Prisma.Decimal {
    const decimal = this.toDecimal(value);
    if (!decimal.gt(ZERO)) {
      throw new BadRequestException(message);
    }

    return decimal;
  }

  private toOptionalNonNegativeDecimal(value?: number | null): Prisma.Decimal {
    if (value == null) {
      return ZERO;
    }

    const decimal = this.toDecimal(value);
    if (decimal.lt(ZERO)) {
      throw new BadRequestException('Values cannot be negative.');
    }

    return decimal;
  }

  private toNonNegativeDecimal(value: number): Prisma.Decimal {
    const decimal = this.toDecimal(value);
    if (decimal.lt(ZERO)) {
      throw new BadRequestException('Target percentages cannot be negative.');
    }

    return decimal;
  }

  private toBrokerageOperationResponse(
    operation: BrokerageOperation,
  ): BrokerageOperationResponse {
    return {
      id: operation.id,
      kind: operation.kind,
      accountId: operation.accountId,
      assetId: operation.assetId ?? null,
      postedAt: operation.postedAt.toISOString(),
      currency: operation.currency,
      quantity: operation.quantity?.toNumber() ?? null,
      unitPrice: operation.unitPrice?.toNumber() ?? null,
      grossAmount: operation.grossAmount?.toNumber() ?? null,
      feeAmount: operation.feeAmount?.toNumber() ?? null,
      cashAmount: operation.cashAmount.toNumber(),
      realisedGainLoss: operation.realisedGainLoss?.toNumber() ?? null,
      notes: operation.notes ?? null,
      mirroredTransactionId: operation.mirroredTransactionId ?? null,
    };
  }

  private async findBrokerageOperationsSafe(
    ownerId: string,
    accountId: string,
    limit?: number,
  ): Promise<(BrokerageOperation & { asset?: Asset | null })[]> {
    try {
      return await this.prisma.brokerageOperation.findMany({
        where: { userId: ownerId, accountId },
        include: {
          asset: true,
        },
        orderBy: [{ postedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        ...(limit ? { take: limit } : {}),
      });
    } catch (error) {
      if (this.isMissingTableError(error, 'BrokerageOperation')) {
        this.logger.warn(
          'BrokerageOperation table is unavailable; brokerage activity is hidden until migrations are applied.',
        );
        return [];
      }

      throw error;
    }
  }

  private async findPortfolioAssetKindTargetsSafe(
    ownerId: string,
  ): Promise<{ kind: AssetKind; targetPercent: Prisma.Decimal }[]> {
    try {
      return await this.prisma.portfolioAssetKindTarget.findMany({
        where: { userId: ownerId },
        orderBy: { kind: 'asc' },
      });
    } catch (error) {
      if (this.isMissingTableError(error, 'PortfolioAssetKindTarget')) {
        this.logger.warn(
          'PortfolioAssetKindTarget table is unavailable; brokerage allocation targets are hidden until migrations are applied.',
        );
        return [];
      }

      throw error;
    }
  }

  private async findPortfolioSecurityTargetsSafe(
    ownerId: string,
  ): Promise<SecurityTargetModel[]> {
    try {
      return await this.prisma.portfolioSecurityTarget.findMany({
        where: { userId: ownerId },
        orderBy: [{ kind: 'asc' }, { ticker: 'asc' }, { exchange: 'asc' }],
      });
    } catch (error) {
      if (this.isMissingTableError(error, 'PortfolioSecurityTarget')) {
        this.logger.warn(
          'PortfolioSecurityTarget table is unavailable; brokerage allocation targets are hidden until migrations are applied.',
        );
        return [];
      }

      throw error;
    }
  }

  private isMissingTableError(error: unknown, tableName: string): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    if (error.code !== 'P2021') {
      return false;
    }

    const table =
      error.meta && typeof error.meta === 'object' && 'table' in error.meta
        ? error.meta.table
        : null;
    const modelName =
      error.meta && typeof error.meta === 'object' && 'modelName' in error.meta
        ? error.meta.modelName
        : null;

    return table === `public.${tableName}` || modelName === tableName;
  }
}
