import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { PricesService } from '@prices/prices.service';
import { CreateAccountDto } from '@accounts/dto/create-account.dto';
import { UpdateAccountDto } from '@accounts/dto/update-account.dto';
import { TransactionsService } from '@transactions/transactions.service';
import { romeDateToUtcStart } from '@transactions/transactions.dates';
import type { LogicalTransactionEntry } from '@transactions/transactions.types';
import {
  Account,
  AccountType,
  Asset,
  Prisma,
  Transaction,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';
import type {
  AccountReconciliationAdjustmentGuidanceResponse,
  AccountReconciliationBaselineMode,
  AccountReconciliationDiagnosticResponse,
  AccountReconciliationIssueCode,
  AccountReconciliationStatus,
} from '@finhance/shared';

interface PreparedAccountInput {
  userId: string;
  name: string;
  type: AccountType;
  currency: string;
  institution: string | null;
  notes: string | null;
  order: number | null;
  openingBalance: Prisma.Decimal;
  openingBalanceDate: Date | null;
}

export interface AccountReconciliationModel {
  account: Account;
  status: AccountReconciliationStatus;
  baselineMode: AccountReconciliationBaselineMode;
  trackedBalance: Prisma.Decimal | null;
  expectedBalance: Prisma.Decimal | null;
  delta: Prisma.Decimal | null;
  assetCount: number;
  transactionCount: number;
  issueCodes: AccountReconciliationIssueCode[];
  diagnostics: AccountReconciliationDiagnosticResponse[];
  canCreateAdjustment: boolean;
  adjustmentGuidance: AccountReconciliationAdjustmentGuidanceResponse;
}

type AccountTransactionClient = Prisma.TransactionClient;
type ReconciliationReadClient = PrismaService | Prisma.TransactionClient;
const ZERO = new Prisma.Decimal(0);

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService,
    @Optional()
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService?: TransactionsService,
  ) {}

  async findAll(
    ownerId: string,
    options?: { includeArchived?: boolean },
    client: ReconciliationReadClient = this.prisma,
  ): Promise<Account[]> {
    const includeArchived = options?.includeArchived ?? false;
    const accounts = await client.account.findMany({
      where: {
        userId: ownerId,
        ...(includeArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    if (!includeArchived) {
      return accounts;
    }

    return accounts.sort((left, right) => {
      if (left.archivedAt && !right.archivedAt) {
        return 1;
      }

      if (!left.archivedAt && right.archivedAt) {
        return -1;
      }

      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.createdAt.getTime() - right.createdAt.getTime();
    });
  }

  async findOne(ownerId: string, id: string): Promise<Account> {
    const account = await this.prisma.account.findFirst({
      where: { id, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} was not found.`);
    }

    return account;
  }

  async findReconciliation(
    ownerId: string,
    options?: { includeArchived?: boolean },
    client: ReconciliationReadClient = this.prisma,
  ): Promise<AccountReconciliationModel[]> {
    const accounts = await this.findAll(ownerId, options, client);

    if (accounts.length === 0) {
      return [];
    }

    const accountIds = new Set(accounts.map((account) => account.id));
    const [assets, transactions] = await Promise.all([
      client.asset.findMany({
        where: {
          userId: ownerId,
          accountId: {
            in: [...accountIds],
          },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      client.transaction.findMany({
        where: {
          userId: ownerId,
        },
        orderBy: [{ postedAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return this.buildReconciliation(accounts, assets, transactions);
  }

  async createReconciliationAdjustment(
    ownerId: string,
    accountId: string,
  ): Promise<LogicalTransactionEntry> {
    const transactionsService = this.transactionsService;

    if (!transactionsService) {
      throw new ConflictException(
        'Transaction adjustments are not available in the current module context.',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const reconciliation = (
          await this.findReconciliation(ownerId, { includeArchived: true }, tx)
        ).find((entry) => entry.account.id === accountId);

        if (!reconciliation) {
          throw new NotFoundException(`Account ${accountId} was not found.`);
        }

        if (!reconciliation.canCreateAdjustment || !reconciliation.delta) {
          throw new ConflictException(
            'This account cannot create a reconciliation adjustment right now.',
          );
        }

        if (reconciliation.account.archivedAt) {
          throw new ConflictException(
            'Archived accounts cannot receive new reconciliation adjustments.',
          );
        }

        // Recompute and persist inside one serializable transaction so
        // concurrent requests cannot both apply the same delta snapshot.
        return transactionsService.createReconciliationAdjustment(
          ownerId,
          {
            accountId,
            amount: reconciliation.delta.abs(),
            direction: reconciliation.delta.gt(ZERO)
              ? TransactionDirection.INFLOW
              : TransactionDirection.OUTFLOW,
            notes: this.buildReconciliationAdjustmentNote(reconciliation),
          },
          tx,
        );
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async create(ownerId: string, dto: CreateAccountDto): Promise<Account> {
    const prepared = this.prepareAccountInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      const activeAccounts = await this.findActiveOrderedAccounts(tx, ownerId);
      const targetOrder = this.clampOrder(
        prepared.order,
        activeAccounts.length,
      );
      const account = await tx.account.create({
        data: {
          userId: prepared.userId,
          name: prepared.name,
          type: prepared.type,
          currency: prepared.currency,
          institution: prepared.institution,
          notes: prepared.notes,
          order: activeAccounts.length,
          openingBalance: prepared.openingBalance,
          openingBalanceDate: prepared.openingBalanceDate,
        },
      });

      const reorderedIds = activeAccounts.map(
        (activeAccount) => activeAccount.id,
      );
      reorderedIds.splice(targetOrder, 0, account.id);
      await this.applyActiveOrder(
        tx,
        [...activeAccounts, account],
        reorderedIds,
      );

      return this.getRequiredAccount(tx, ownerId, account.id);
    });
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const prepared = this.prepareAccountInput(ownerId, dto);

    return this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredAccount(tx, ownerId, id);
      await this.assertOpeningBalanceBaselineUpdateAllowed(
        tx,
        ownerId,
        existing,
        prepared,
      );

      if (
        existing.currency !== prepared.currency &&
        this.accountHasOpeningBalanceBaseline(existing)
      ) {
        throw new BadRequestException(
          'Clear the opening balance baseline before changing this account currency.',
        );
      }

      await tx.account.update({
        where: { id },
        data: {
          name: prepared.name,
          type: prepared.type,
          currency: prepared.currency,
          institution: prepared.institution,
          notes: prepared.notes,
          openingBalance: prepared.openingBalance,
          openingBalanceDate: prepared.openingBalanceDate,
          ...(existing.archivedAt
            ? {
                order:
                  prepared.order === null
                    ? existing.order
                    : Math.max(0, Math.trunc(prepared.order)),
              }
            : {}),
        },
      });

      if (!existing.archivedAt) {
        const activeAccounts = await this.findActiveOrderedAccounts(
          tx,
          ownerId,
        );
        const reorderedIds = activeAccounts
          .map((activeAccount) => activeAccount.id)
          .filter((accountId) => accountId !== id);
        const currentIndex = activeAccounts.findIndex(
          (activeAccount) => activeAccount.id === id,
        );
        const targetOrder = this.clampOrder(
          prepared.order ?? currentIndex,
          reorderedIds.length,
        );

        reorderedIds.splice(targetOrder, 0, id);
        await this.applyActiveOrder(tx, activeAccounts, reorderedIds);
      }

      return this.getRequiredAccount(tx, ownerId, id);
    });
  }

  async remove(ownerId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRequiredAccount(tx, ownerId, id);

      if (existing.archivedAt) {
        return;
      }

      const activeAccounts = await this.findActiveOrderedAccounts(tx, ownerId);
      const reorderedIds = activeAccounts
        .map((activeAccount) => activeAccount.id)
        .filter((accountId) => accountId !== id);

      await tx.account.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await this.applyActiveOrder(tx, activeAccounts, reorderedIds);
    });
  }

  async assertAccountAssignmentAllowed(
    ownerId: string,
    accountId: string | null,
    currentAccountId?: string | null,
  ): Promise<void> {
    if (!accountId) {
      return;
    }

    await this.getAssignableAccount(ownerId, accountId, currentAccountId);
  }

  async getAssignableAccount(
    ownerId: string,
    accountId: string,
    currentAccountId?: string | null,
  ): Promise<Account> {
    let account: Account;

    try {
      account = await this.findOne(ownerId, accountId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(`Account ${accountId} is invalid.`);
      }

      throw error;
    }

    if (account.archivedAt && account.id !== currentAccountId) {
      throw new BadRequestException(
        'Archived accounts cannot be newly assigned to assets.',
      );
    }

    return account;
  }

  private async buildReconciliation(
    accounts: Account[],
    assets: Asset[],
    transactions: Transaction[],
  ): Promise<AccountReconciliationModel[]> {
    const assetsByAccountId = new Map<string, Asset[]>();
    const transactionsByAccountId = new Map<string, Transaction[]>();
    const transferIssueAccountIds = new Set<string>();
    const fxPairKeys = new Set<string>();
    const accountById = new Map(
      accounts.map((account) => [account.id, account]),
    );

    for (const asset of assets) {
      if (!asset.accountId) {
        continue;
      }

      const existing = assetsByAccountId.get(asset.accountId) ?? [];
      existing.push(asset);
      assetsByAccountId.set(asset.accountId, existing);

      const account = accountById.get(asset.accountId);
      if (account && asset.currency !== account.currency) {
        fxPairKeys.add(this.fxPairKey(asset.currency, account.currency));
      }
    }

    const transferGroups = new Map<string, Transaction[]>();
    const invalidTransferGroupIds = new Set<string>();

    for (const transaction of transactions) {
      if (
        transaction.kind === TransactionKind.TRANSFER &&
        transaction.transferGroupId
      ) {
        const group = transferGroups.get(transaction.transferGroupId) ?? [];
        group.push(transaction);
        transferGroups.set(transaction.transferGroupId, group);
      }
    }

    for (const [groupId, group] of transferGroups.entries()) {
      const hasOutflow = group.some(
        (transaction) => transaction.direction === TransactionDirection.OUTFLOW,
      );
      const hasInflow = group.some(
        (transaction) => transaction.direction === TransactionDirection.INFLOW,
      );

      if (group.length !== 2 || !hasOutflow || !hasInflow) {
        invalidTransferGroupIds.add(groupId);
      }
    }

    for (const transaction of transactions) {
      const account = accountById.get(transaction.accountId);
      if (
        !account ||
        !this.shouldIncludeTransactionInReconciliation(account, transaction)
      ) {
        continue;
      }

      const existing = transactionsByAccountId.get(transaction.accountId) ?? [];
      existing.push(transaction);
      transactionsByAccountId.set(transaction.accountId, existing);

      if (transaction.kind !== TransactionKind.TRANSFER) {
        continue;
      }

      if (
        !transaction.transferGroupId ||
        invalidTransferGroupIds.has(transaction.transferGroupId)
      ) {
        transferIssueAccountIds.add(transaction.accountId);
      }
    }

    const fxRates = await this.resolveFxRates(fxPairKeys);

    return accounts.map((account) =>
      this.buildAccountReconciliationEntry(
        account,
        assetsByAccountId.get(account.id) ?? [],
        transactionsByAccountId.get(account.id) ?? [],
        transferIssueAccountIds,
        fxRates,
      ),
    );
  }

  private buildAccountReconciliationEntry(
    account: Account,
    assets: Asset[],
    transactions: Transaction[],
    transferIssueAccountIds: Set<string>,
    fxRates: Map<string, Prisma.Decimal | null>,
  ): AccountReconciliationModel {
    const issueCodes = new Set<AccountReconciliationIssueCode>();
    const baselineMode: AccountReconciliationBaselineMode =
      account.openingBalanceDate === null ? 'FULL_HISTORY' : 'OPENING_BALANCE';
    let trackedBalance = ZERO;
    let expectedBalance = account.openingBalance;

    for (const asset of assets) {
      let signedBalance =
        asset.type === 'LIABILITY' ? ZERO.sub(asset.balance) : asset.balance;

      if (asset.currency !== account.currency) {
        const fxRate =
          fxRates.get(this.fxPairKey(asset.currency, account.currency)) ?? null;

        if (!fxRate) {
          issueCodes.add('FX_UNAVAILABLE');
          continue;
        }

        signedBalance = signedBalance.mul(fxRate);
      }

      trackedBalance = trackedBalance.add(signedBalance);
    }

    for (const transaction of transactions) {
      const signedAmount =
        transaction.direction === TransactionDirection.INFLOW
          ? transaction.amount
          : ZERO.sub(transaction.amount);
      expectedBalance = expectedBalance.add(signedAmount);
    }

    if (transferIssueAccountIds.has(account.id)) {
      issueCodes.add('TRANSFER_GROUP_INCOMPLETE');
    }

    if (issueCodes.has('FX_UNAVAILABLE')) {
      const diagnostics = this.buildReconciliationDiagnostics({
        account,
        issueCodes: [...issueCodes],
        delta: null,
        assetCount: assets.length,
        transactionCount: transactions.length,
      });
      return {
        account,
        status: 'UNSUPPORTED',
        baselineMode,
        trackedBalance: null,
        expectedBalance: null,
        delta: null,
        assetCount: assets.length,
        transactionCount: transactions.length,
        issueCodes: [...issueCodes],
        diagnostics,
        canCreateAdjustment: false,
        adjustmentGuidance: this.buildAdjustmentGuidance({
          account,
          status: 'UNSUPPORTED',
          delta: null,
          issueCodes: [...issueCodes],
          canCreateAdjustment: false,
        }),
      };
    }

    const delta = trackedBalance.sub(expectedBalance);
    const status: AccountReconciliationStatus =
      issueCodes.has('TRANSFER_GROUP_INCOMPLETE') || !delta.eq(ZERO)
        ? 'MISMATCH'
        : 'CLEAN';
    const issueCodeList = [...issueCodes];
    const diagnostics = this.buildReconciliationDiagnostics({
      account,
      issueCodes: issueCodeList,
      delta,
      assetCount: assets.length,
      transactionCount: transactions.length,
    });
    const canCreateAdjustment =
      account.archivedAt === null &&
      status === 'MISMATCH' &&
      !delta.eq(ZERO) &&
      !issueCodes.has('TRANSFER_GROUP_INCOMPLETE');

    return {
      account,
      status,
      baselineMode,
      trackedBalance,
      expectedBalance,
      delta,
      assetCount: assets.length,
      transactionCount: transactions.length,
      issueCodes: issueCodeList,
      diagnostics,
      canCreateAdjustment,
      adjustmentGuidance: this.buildAdjustmentGuidance({
        account,
        status,
        delta,
        issueCodes: issueCodeList,
        canCreateAdjustment,
      }),
    };
  }

  private buildReconciliationDiagnostics(input: {
    account: Account;
    issueCodes: AccountReconciliationIssueCode[];
    delta: Prisma.Decimal | null;
    assetCount: number;
    transactionCount: number;
  }): AccountReconciliationDiagnosticResponse[] {
    const diagnostics: AccountReconciliationDiagnosticResponse[] = [];
    const issueCodes = new Set(input.issueCodes);

    if (
      input.account.openingBalanceDate === null &&
      (input.assetCount > 0 || input.transactionCount > 0)
    ) {
      diagnostics.push({
        code: 'BASELINE_MISSING',
        severity: 'WARNING',
        summary: 'This account has no opening-balance baseline.',
        likelyCause:
          'Reconciliation is relying on the full transaction history to reach the expected balance.',
        recommendedAction:
          'Set an opening balance date once the current account state is trustworthy, or confirm the full history is complete.',
      });
    }

    if (issueCodes.has('FX_UNAVAILABLE')) {
      diagnostics.push({
        code: 'FX_UNAVAILABLE',
        severity: 'WARNING',
        summary: 'Cross-currency assets could not be converted.',
        likelyCause:
          'At least one assigned asset needs an FX rate that is missing right now.',
        recommendedAction:
          'Refresh prices or simplify the account to a single currency before trusting this reconciliation result.',
      });
    }

    if (issueCodes.has('TRANSFER_GROUP_INCOMPLETE')) {
      diagnostics.push({
        code: 'TRANSFER_GROUP_INCOMPLETE',
        severity: 'WARNING',
        summary: 'A transfer is missing its matching counterpart row.',
        likelyCause:
          'One side of a transfer was deleted, filtered out by a baseline, or never imported correctly.',
        recommendedAction:
          'Review recent transfers and restore the missing pair before using a reconciliation adjustment.',
      });
    }

    if (
      input.account.openingBalanceDate !== null &&
      input.delta !== null &&
      !input.delta.eq(ZERO) &&
      !issueCodes.has('FX_UNAVAILABLE') &&
      !issueCodes.has('TRANSFER_GROUP_INCOMPLETE')
    ) {
      diagnostics.push({
        code: 'BASELINE_POSSIBLY_STALE',
        severity: 'INFO',
        summary: 'The opening-balance baseline may no longer match reality.',
        likelyCause:
          'A post-baseline transaction, asset balance, or manual baseline value is out of sync with the tracked account state.',
        recommendedAction:
          'Compare recent account activity and the opening balance before deciding whether a reconciliation adjustment is appropriate.',
      });
    }

    return diagnostics;
  }

  private buildAdjustmentGuidance(input: {
    account: Account;
    status: AccountReconciliationStatus;
    delta: Prisma.Decimal | null;
    issueCodes: AccountReconciliationIssueCode[];
    canCreateAdjustment: boolean;
  }): AccountReconciliationAdjustmentGuidanceResponse {
    if (input.account.archivedAt !== null) {
      return {
        status: 'BLOCKED',
        message: 'Archived accounts cannot receive reconciliation adjustments.',
      };
    }

    if (input.status === 'UNSUPPORTED') {
      return {
        status: 'BLOCKED',
        message:
          'Reconciliation is unsupported until the structural issues are resolved.',
      };
    }

    if (!input.delta || input.delta.eq(ZERO)) {
      return {
        status: 'BLOCKED',
        message:
          'No adjustment is needed because the account already reconciles.',
      };
    }

    if (input.issueCodes.includes('TRANSFER_GROUP_INCOMPLETE')) {
      return {
        status: 'SUSPICIOUS',
        message:
          'A broken transfer is skewing the expected balance. Fix the transfer pair before using an adjustment.',
      };
    }

    if (input.account.openingBalanceDate === null) {
      return {
        status: 'SUSPICIOUS',
        message:
          'This account has no opening-balance baseline, so an adjustment could hide missing historical data.',
      };
    }

    if (input.canCreateAdjustment) {
      return {
        status: 'SAFE',
        message:
          'An adjustment is reasonable here once you confirm the mismatch is real and not caused by a stale baseline or missing activity.',
      };
    }

    return {
      status: 'BLOCKED',
      message:
        'This account cannot create a reconciliation adjustment right now.',
    };
  }

  private async resolveFxRates(
    pairKeys: Set<string>,
  ): Promise<Map<string, Prisma.Decimal | null>> {
    const entries = await Promise.all(
      [...pairKeys].map(async (pairKey) => {
        const [fromCurrency, toCurrency] = pairKey.split(':');
        return [
          pairKey,
          await this.pricesService.getFxRate(fromCurrency, toCurrency),
        ] as const;
      }),
    );

    return new Map(entries);
  }

  private fxPairKey(fromCurrency: string, toCurrency: string): string {
    return `${fromCurrency}:${toCurrency}`;
  }

  private buildReconciliationAdjustmentNote(
    reconciliation: AccountReconciliationModel,
  ): string {
    return `Reconciliation snapshot: tracked=${reconciliation.trackedBalance?.toString() ?? 'n/a'} ${reconciliation.account.currency}, expected=${reconciliation.expectedBalance?.toString() ?? 'n/a'} ${reconciliation.account.currency}, delta=${reconciliation.delta?.toString() ?? 'n/a'} ${reconciliation.account.currency}.`;
  }

  private prepareAccountInput(
    ownerId: string,
    dto: CreateAccountDto | UpdateAccountDto,
  ): PreparedAccountInput {
    const openingBalance = this.parseOpeningBalance(dto.openingBalance);
    const openingBalanceDate = this.parseOpeningBalanceDate(
      dto.openingBalanceDate,
    );

    if (!openingBalance.eq(ZERO) && !openingBalanceDate) {
      throw new BadRequestException(
        'openingBalanceDate is required when openingBalance is not zero.',
      );
    }

    return {
      userId: ownerId,
      name: dto.name.trim(),
      type: dto.type,
      currency: this.pricesService.normalizeCurrency(dto.currency ?? 'EUR'),
      institution: dto.institution ?? null,
      notes: dto.notes ?? null,
      order:
        dto.order === null || dto.order === undefined
          ? null
          : Math.trunc(dto.order),
      openingBalance,
      openingBalanceDate,
    };
  }

  private async assertOpeningBalanceBaselineUpdateAllowed(
    tx: AccountTransactionClient,
    ownerId: string,
    existing: Pick<Account, 'id' | 'openingBalance' | 'openingBalanceDate'>,
    prepared: Pick<
      PreparedAccountInput,
      'openingBalance' | 'openingBalanceDate'
    >,
  ): Promise<void> {
    if (!this.isOpeningBalanceBaselineChanged(existing, prepared)) {
      return;
    }

    const [existingAsset, existingTransaction] = await Promise.all([
      tx.asset.findFirst({
        where: {
          userId: ownerId,
          accountId: existing.id,
        },
        select: { id: true },
      }),
      tx.transaction.findFirst({
        where: {
          userId: ownerId,
          accountId: existing.id,
        },
        select: { id: true },
      }),
    ]);

    if (!existingAsset && !existingTransaction) {
      return;
    }

    throw new ConflictException(
      // Rewriting the baseline after history exists would retroactively
      // reinterpret prior balances and break reconciliation integrity.
      'Opening balance baselines cannot be changed after assets or transactions exist for this account.',
    );
  }

  private isOpeningBalanceBaselineChanged(
    existing: Pick<Account, 'openingBalance' | 'openingBalanceDate'>,
    prepared: Pick<
      PreparedAccountInput,
      'openingBalance' | 'openingBalanceDate'
    >,
  ): boolean {
    const existingDate = existing.openingBalanceDate?.toISOString() ?? null;
    const nextDate = prepared.openingBalanceDate?.toISOString() ?? null;

    return (
      !existing.openingBalance.eq(prepared.openingBalance) ||
      existingDate !== nextDate
    );
  }

  private shouldIncludeTransactionInReconciliation(
    account: Account,
    transaction: Transaction,
  ): boolean {
    if (!account.openingBalanceDate) {
      return true;
    }

    return transaction.postedAt >= this.getOpeningBalanceCutoff(account);
  }

  private getOpeningBalanceCutoff(account: Account): Date {
    return romeDateToUtcStart(
      account.openingBalanceDate!.toISOString().slice(0, 10),
    );
  }

  private accountHasOpeningBalanceBaseline(
    account: Pick<Account, 'openingBalance' | 'openingBalanceDate'>,
  ): boolean {
    return (
      account.openingBalanceDate !== null || !account.openingBalance.eq(ZERO)
    );
  }

  private parseOpeningBalance(value?: number | null): Prisma.Decimal {
    if (value === null || value === undefined) {
      return ZERO;
    }

    return new Prisma.Decimal(value);
  }

  private parseOpeningBalanceDate(value?: string | null): Date | null {
    if (!value) {
      return null;
    }

    const parsed = new Date(`${value}T00:00:00.000Z`);

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value
    ) {
      throw new BadRequestException(
        `openingBalanceDate ${value} is not a valid calendar date.`,
      );
    }

    return parsed;
  }

  private async findActiveOrderedAccounts(
    tx: AccountTransactionClient,
    ownerId: string,
  ): Promise<Account[]> {
    return tx.account.findMany({
      where: {
        userId: ownerId,
        archivedAt: null,
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  private async applyActiveOrder(
    tx: AccountTransactionClient,
    currentAccounts: Account[],
    orderedIds: string[],
  ): Promise<void> {
    const currentOrderById = new Map(
      currentAccounts.map((account) => [account.id, account.order]),
    );

    for (const [index, accountId] of orderedIds.entries()) {
      if (currentOrderById.get(accountId) === index) {
        continue;
      }

      await tx.account.update({
        where: { id: accountId },
        data: { order: index },
      });
    }
  }

  private clampOrder(order: number | null, max: number): number {
    if (order === null || Number.isNaN(order)) {
      return max;
    }

    return Math.min(Math.max(Math.trunc(order), 0), max);
  }

  private async getRequiredAccount(
    tx: AccountTransactionClient,
    ownerId: string,
    id: string,
  ): Promise<Account> {
    const account = await tx.account.findFirst({
      where: { id, userId: ownerId },
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} was not found.`);
    }

    return account;
  }
}
