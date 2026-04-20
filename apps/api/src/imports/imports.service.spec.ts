import { ConflictException } from '@nestjs/common';
import { ImportsService } from '@imports/imports.service';
import { PrismaService } from '@prisma/prisma.service';
import { PricesService } from '@prices/prices.service';
import {
  AccountType,
  AssetKind,
  AssetType,
  CategoryType,
  ImportBatchStatus,
  ImportSource,
  Prisma,
  TransactionDirection,
  TransactionKind,
} from '@prisma/client';

const OWNER_ID = 'local-dev';
type ImportBatchCreateCall = {
  data: {
    payloadJson: unknown;
  };
};

function nthCallArg<T>(mockFn: jest.Mock, index: number): T {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[index]?.[0] as T;
}

function createImportBatch(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'batch-1',
    userId: OWNER_ID,
    source: ImportSource.CSV_TEMPLATE,
    status: ImportBatchStatus.PREVIEW,
    summaryJson: { files: [], errorCount: 0, warningCount: 0 },
    errorJson: [],
    payloadJson: null,
    createdAt: new Date('2026-04-19T10:00:00.000Z'),
    appliedAt: null,
    ...overrides,
  };
}

function createImportedAccount(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-04-19T10:00:00.000Z');

  return {
    id: 'account-1',
    userId: OWNER_ID,
    importSource: ImportSource.CSV_TEMPLATE,
    importKey: 'checking',
    name: 'Checking',
    type: AccountType.BANK,
    currency: 'EUR',
    institution: null,
    notes: null,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createImportedTransaction(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-04-19T10:00:00.000Z');

  return {
    id: 'transaction-1',
    userId: OWNER_ID,
    importSource: ImportSource.CSV_TEMPLATE,
    importKey: 'salary-2026-04',
    postedAt: new Date('2026-04-01T08:00:00.000Z'),
    accountId: 'account-1',
    categoryId: null,
    amount: new Prisma.Decimal('5000'),
    currency: 'EUR',
    direction: TransactionDirection.INFLOW,
    kind: TransactionKind.INCOME,
    description: 'Salary',
    notes: null,
    counterparty: 'Employer',
    transferGroupId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createImportedCategory(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-04-19T10:00:00.000Z');

  return {
    id: 'category-1',
    userId: OWNER_ID,
    importSource: ImportSource.CSV_TEMPLATE,
    importKey: 'salary',
    name: 'Salary',
    type: CategoryType.INCOME,
    order: 0,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createImportedAsset(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const now = new Date('2026-04-19T10:00:00.000Z');

  return {
    id: 'asset-1',
    userId: OWNER_ID,
    accountId: 'account-1',
    importSource: ImportSource.CSV_TEMPLATE,
    importKey: 'cash-wallet',
    name: 'Wallet',
    kind: AssetKind.CASH,
    liabilityKind: null,
    ticker: null,
    exchange: null,
    quantity: null,
    unitPrice: null,
    notes: null,
    order: 0,
    type: AssetType.ASSET,
    balance: new Prisma.Decimal('100'),
    currency: 'EUR',
    createdAt: now,
    updatedAt: now,
    lastPrice: null,
    lastPriceAt: null,
    lastFxRate: null,
    lastFxRateAt: null,
    account: createImportedAccount(),
    ...overrides,
  };
}

function parseZipEntries(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let offset = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = buffer.toString('utf8', fileNameStart, fileNameEnd);
    const data = buffer.toString('utf8', dataStart, dataEnd);

    entries.set(fileName, data);
    offset = dataEnd;
  }

  return entries;
}

describe('ImportsService', () => {
  let service: ImportsService;
  let prisma: {
    account: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    asset: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    category: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    transaction: {
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    importBatch: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let prices: {
    normalizeCurrency: jest.Mock;
    normalizeTicker: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      account: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      category: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      transaction: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      importBatch: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    prisma.$transaction.mockImplementation(
      async (
        callback: (tx: {
          account: typeof prisma.account;
          asset: typeof prisma.asset;
          category: typeof prisma.category;
          transaction: typeof prisma.transaction;
          importBatch: typeof prisma.importBatch;
        }) => Promise<unknown>,
      ) =>
        callback({
          account: prisma.account,
          asset: prisma.asset,
          category: prisma.category,
          transaction: prisma.transaction,
          importBatch: prisma.importBatch,
        }),
    );

    prisma.importBatch.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => createImportBatch(data),
    );
    prisma.importBatch.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        createImportBatch({ ...data, id: 'batch-1' }),
    );

    prices = {
      normalizeCurrency: jest.fn((currency: string) =>
        currency.trim().toUpperCase(),
      ),
      normalizeTicker: jest.fn((ticker: string) => ticker.trim().toUpperCase()),
    };

    service = new ImportsService(
      prisma as unknown as PrismaService,
      prices as unknown as PricesService,
    );
  });

  it('previews a valid accounts template as a safe create batch', async () => {
    const result = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(
          'importKey,name,type,currency,institution,notes,order,archived\nchecking,Checking,BANK,EUR,,,0,false\n',
        ),
      },
    });

    expect(result.status).toBe('PREVIEW');
    expect(result.canApply).toBe(true);
    expect(result.summary.files).toEqual([
      {
        file: 'accounts',
        createCount: 1,
        updateCount: 0,
        unchangedCount: 0,
      },
    ]);
    expect(result.issues).toEqual([]);
    expect(
      nthCallArg<ImportBatchCreateCall>(prisma.importBatch.create, 0).data
        .payloadJson,
    ).toEqual({
      providedFiles: ['accounts'],
      accounts: [
        {
          rowNumber: 2,
          importKey: 'checking',
          name: 'Checking',
          type: 'BANK',
          currency: 'EUR',
          institution: null,
          notes: null,
          order: 0,
          archived: false,
        },
      ],
      categories: [],
      assets: [],
      transactions: [],
    });
  });

  it('stores a failed preview when headers do not match the template', async () => {
    const result = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from('wrong,name\nchecking,Checking\n'),
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.canApply).toBe(false);
    expect(result.issues[0]?.message).toContain(
      'does not match the finhance template',
    );
  });

  it('fails preview when imported assets reference missing accounts', async () => {
    const result = await service.previewCsv(OWNER_ID, {
      assets: {
        originalName: 'assets.csv',
        buffer: Buffer.from(
          'importKey,name,type,kind,liabilityKind,currency,balance,accountImportKey,ticker,exchange,quantity,unitPrice,notes,order\ncash-eur,Wallet,ASSET,CASH,,EUR,100,missing-account,,,,,,0\n',
        ),
      },
    });

    expect(result.status).toBe('FAILED');
    expect(result.canApply).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: 'assets',
          field: 'accountImportKey',
        }),
      ]),
    );
  });

  it('marks an identical imported transaction as unchanged during preview', async () => {
    prisma.account.findMany.mockResolvedValue([createImportedAccount()]);
    prisma.transaction.findMany.mockResolvedValue([
      createImportedTransaction(),
    ]);

    const result = await service.previewCsv(OWNER_ID, {
      transactions: {
        originalName: 'transactions.csv',
        buffer: Buffer.from(
          'importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\nsalary-2026-04,2026-04-01T08:00:00.000Z,INCOME,5000,Salary,,checking,INFLOW,,Employer,,\n',
        ),
      },
    });

    expect(result.status).toBe('PREVIEW');
    expect(result.canApply).toBe(true);
    expect(result.summary.files).toEqual([
      {
        file: 'transactions',
        createCount: 0,
        updateCount: 0,
        unchangedCount: 1,
      },
    ]);
  });

  it('applies a transfer batch by creating two transaction rows', async () => {
    await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(
          'importKey,name,type,currency,institution,notes,order,archived\nchecking,Checking,BANK,EUR,,,0,false\nsavings,Savings,BANK,EUR,,,1,false\n',
        ),
      },
      transactions: {
        originalName: 'transactions.csv',
        buffer: Buffer.from(
          'importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\nxfer-1,2026-04-19T09:00:00.000Z,TRANSFER,50,Move cash,,,,,,checking,savings\n',
        ),
      },
    });

    prisma.importBatch.findFirst.mockResolvedValue(createImportBatch());
    prisma.account.create
      .mockResolvedValueOnce(createImportedAccount({ id: 'account-checking' }))
      .mockResolvedValueOnce(
        createImportedAccount({
          id: 'account-savings',
          importKey: 'savings',
          name: 'Savings',
          order: 1,
        }),
      );
    prisma.transaction.create
      .mockResolvedValueOnce(
        createImportedTransaction({
          id: 'transaction-out',
          importKey: 'xfer-1',
          kind: TransactionKind.TRANSFER,
          direction: TransactionDirection.OUTFLOW,
          accountId: 'account-checking',
          description: 'Move cash',
          counterparty: null,
          transferGroupId: 'transfer_group',
          amount: new Prisma.Decimal('50'),
        }),
      )
      .mockResolvedValueOnce(
        createImportedTransaction({
          id: 'transaction-in',
          importKey: 'xfer-1',
          kind: TransactionKind.TRANSFER,
          direction: TransactionDirection.INFLOW,
          accountId: 'account-savings',
          description: 'Move cash',
          counterparty: null,
          transferGroupId: 'transfer_group',
          amount: new Prisma.Decimal('50'),
        }),
      );

    const result = await service.applyBatch(OWNER_ID, 'batch-1');

    expect(result.status).toBe('APPLIED');
    expect(prisma.transaction.create).toHaveBeenCalledTimes(2);
    const calls = prisma.transaction.create.mock.calls as Array<
      Array<{ data: Record<string, unknown> }>
    >;
    expect(calls[0]?.[0].data.importKey).toBe('xfer-1');
    expect(calls[1]?.[0].data.importKey).toBe('xfer-1');
  });

  it('exports a zip with the four template files and backfills manual keys', async () => {
    const manualAccount = createImportedAccount({
      id: 'account-manual',
      importSource: null,
      importKey: null,
      name: 'Main checking',
      institution: 'Local Bank',
      notes: 'Primary account',
      archivedAt: new Date('2026-04-18T10:00:00.000Z'),
    });
    const manualCategory = createImportedCategory({
      id: 'category-manual',
      importSource: null,
      importKey: null,
      name: 'Consulting',
      archivedAt: new Date('2026-04-18T10:00:00.000Z'),
    });
    const manualAsset = createImportedAsset({
      id: 'asset-manual',
      importSource: null,
      importKey: null,
      name: 'Cash reserve',
      accountId: 'account-manual',
      account: {
        ...manualAccount,
        importSource: ImportSource.CSV_TEMPLATE,
        importKey: 'manual-account-account-manual',
      },
      notes: 'Emergency fund',
    });
    const manualTransaction = createImportedTransaction({
      id: 'transaction-manual',
      importSource: null,
      importKey: null,
      accountId: 'account-manual',
      categoryId: 'category-manual',
      category: {
        ...manualCategory,
        importSource: ImportSource.CSV_TEMPLATE,
        importKey: 'manual-category-category-manual',
      },
      description: 'Consulting invoice',
    });

    prisma.account.findMany
      .mockResolvedValueOnce([manualAccount])
      .mockResolvedValueOnce([
        {
          ...manualAccount,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-account-account-manual',
        },
      ]);
    prisma.category.findMany
      .mockResolvedValueOnce([manualCategory])
      .mockResolvedValueOnce([
        {
          ...manualCategory,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-category-category-manual',
        },
      ]);
    prisma.asset.findMany
      .mockResolvedValueOnce([manualAsset])
      .mockResolvedValueOnce([
        {
          ...manualAsset,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-asset-asset-manual',
        },
      ]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([manualTransaction])
      .mockResolvedValueOnce([
        {
          ...manualTransaction,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-transaction-transaction-manual',
        },
      ]);

    const result = await service.exportCsvZip(OWNER_ID);
    const entries = parseZipEntries(result.buffer);

    expect(result.filename).toMatch(/^finhance-export-\d{4}-\d{2}-\d{2}\.zip$/);
    expect([...entries.keys()]).toEqual([
      'accounts.csv',
      'categories.csv',
      'assets.csv',
      'transactions.csv',
    ]);
    expect(entries.get('accounts.csv')).toContain(
      'importKey,name,type,currency,institution,notes,order,archived',
    );
    expect(entries.get('accounts.csv')).toContain(
      'manual-account-account-manual,Main checking,BANK,EUR,Local Bank,Primary account,0,true',
    );
    expect(entries.get('categories.csv')).toContain(
      'manual-category-category-manual,Consulting,INCOME,0,true',
    );
    expect(entries.get('assets.csv')).toContain(
      'manual-asset-asset-manual,Cash reserve,ASSET,CASH,,EUR,100,manual-account-account-manual,,,,,Emergency fund,0',
    );
    expect(entries.get('transactions.csv')).toContain(
      'manual-transaction-transaction-manual,2026-04-01T08:00:00.000Z,INCOME,5000,Consulting invoice,,manual-account-account-manual,INFLOW,manual-category-category-manual,Employer,,',
    );
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'account-manual' },
      data: {
        importSource: ImportSource.CSV_TEMPLATE,
        importKey: 'manual-account-account-manual',
      },
    });
  });

  it('neutralizes spreadsheet formulas in exported CSV values', async () => {
    const account = createImportedAccount({
      id: 'account-formula',
      importKey: 'formula-account',
      name: '=1+1',
      notes: ' @SUM',
    });
    const category = createImportedCategory();
    const transaction = createImportedTransaction({
      id: 'transaction-formula',
      accountId: account.id,
      account,
      categoryId: category.id,
      category,
      description: '+cmd',
      notes: '\t=1+1',
      counterparty: '-external',
    });

    prisma.account.findMany
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce([account]);
    prisma.category.findMany
      .mockResolvedValueOnce([category])
      .mockResolvedValueOnce([category]);
    prisma.asset.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([transaction])
      .mockResolvedValueOnce([transaction]);

    const result = await service.exportCsvZip(OWNER_ID);
    const entries = parseZipEntries(result.buffer);

    expect(entries.get('accounts.csv')).toContain("'=1+1");
    expect(entries.get('accounts.csv')).toContain("' @SUM");
    expect(entries.get('transactions.csv')).toContain("'+cmd");
    expect(entries.get('transactions.csv')).toContain("'\t=1+1");
    expect(entries.get('transactions.csv')).toContain("'-external");
  });

  it('exports transfer transactions as one logical row', async () => {
    const checkingAccount = createImportedAccount({
      id: 'account-checking',
      importKey: 'checking',
    });
    const savingsAccount = createImportedAccount({
      id: 'account-savings',
      importKey: 'savings',
      name: 'Savings',
    });
    const transferOut = createImportedTransaction({
      id: 'transaction-out',
      importSource: null,
      importKey: null,
      kind: TransactionKind.TRANSFER,
      direction: TransactionDirection.OUTFLOW,
      accountId: 'account-checking',
      account: checkingAccount,
      categoryId: null,
      category: null,
      counterparty: null,
      description: 'Move cash',
      transferGroupId: 'transfer_group',
      amount: new Prisma.Decimal('250'),
    });
    const transferIn = createImportedTransaction({
      id: 'transaction-in',
      importSource: null,
      importKey: null,
      kind: TransactionKind.TRANSFER,
      direction: TransactionDirection.INFLOW,
      accountId: 'account-savings',
      account: savingsAccount,
      categoryId: null,
      category: null,
      counterparty: null,
      description: 'Move cash',
      transferGroupId: 'transfer_group',
      amount: new Prisma.Decimal('250'),
    });

    prisma.account.findMany
      .mockResolvedValueOnce([checkingAccount, savingsAccount])
      .mockResolvedValueOnce([checkingAccount, savingsAccount]);
    prisma.category.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.asset.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([transferOut, transferIn])
      .mockResolvedValueOnce([
        {
          ...transferOut,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-transfer-transfer_group',
        },
        {
          ...transferIn,
          importSource: ImportSource.CSV_TEMPLATE,
          importKey: 'manual-transfer-transfer_group',
        },
      ]);

    const result = await service.exportCsvZip(OWNER_ID);
    const entries = parseZipEntries(result.buffer);
    const lines = entries.get('transactions.csv')?.trim().split('\n') ?? [];

    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      'manual-transfer-transfer_group,2026-04-01T08:00:00.000Z,TRANSFER,250,Move cash,,,,,,checking,savings',
    );
    expect(prisma.transaction.update).toHaveBeenCalledTimes(2);
  });

  it('fails export when a transfer group is incomplete', async () => {
    const checkingAccount = createImportedAccount({
      id: 'account-checking',
      importKey: 'checking',
    });

    prisma.account.findMany.mockResolvedValue([checkingAccount]);
    prisma.category.findMany.mockResolvedValue([]);
    prisma.asset.findMany.mockResolvedValue([]);
    prisma.transaction.findMany.mockResolvedValue([
      createImportedTransaction({
        id: 'transaction-out',
        kind: TransactionKind.TRANSFER,
        direction: TransactionDirection.OUTFLOW,
        accountId: 'account-checking',
        account: checkingAccount,
        categoryId: null,
        category: null,
        counterparty: null,
        description: 'Broken transfer',
        transferGroupId: 'broken-transfer',
      }),
    ]);

    await expect(service.exportCsvZip(OWNER_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('round-trips an exported archive through preview without creating duplicates', async () => {
    const account = createImportedAccount();
    const category = createImportedCategory();
    const asset = createImportedAsset({
      account,
      accountId: 'account-1',
    });
    const transaction = createImportedTransaction({
      account,
      category,
      categoryId: 'category-1',
    });

    prisma.account.findMany
      .mockResolvedValueOnce([account])
      .mockResolvedValueOnce([account]);
    prisma.category.findMany
      .mockResolvedValueOnce([category])
      .mockResolvedValueOnce([category]);
    prisma.asset.findMany
      .mockResolvedValueOnce([asset])
      .mockResolvedValueOnce([asset]);
    prisma.transaction.findMany
      .mockResolvedValueOnce([transaction])
      .mockResolvedValueOnce([transaction]);

    const exported = await service.exportCsvZip(OWNER_ID);
    const entries = parseZipEntries(exported.buffer);

    prisma.account.findMany.mockReset();
    prisma.category.findMany.mockReset();
    prisma.asset.findMany.mockReset();
    prisma.transaction.findMany.mockReset();

    prisma.account.findMany.mockResolvedValue([account]);
    prisma.category.findMany
      .mockResolvedValueOnce([category])
      .mockResolvedValueOnce([category]);
    prisma.asset.findMany.mockResolvedValue([asset]);
    prisma.transaction.findMany.mockResolvedValue([transaction]);

    const preview = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(entries.get('accounts.csv') ?? '', 'utf8'),
      },
      categories: {
        originalName: 'categories.csv',
        buffer: Buffer.from(entries.get('categories.csv') ?? '', 'utf8'),
      },
      assets: {
        originalName: 'assets.csv',
        buffer: Buffer.from(entries.get('assets.csv') ?? '', 'utf8'),
      },
      transactions: {
        originalName: 'transactions.csv',
        buffer: Buffer.from(entries.get('transactions.csv') ?? '', 'utf8'),
      },
    });

    expect(preview.canApply).toBe(true);
    expect(preview.summary.files).toEqual([
      {
        file: 'accounts',
        createCount: 0,
        updateCount: 0,
        unchangedCount: 1,
      },
      {
        file: 'categories',
        createCount: 0,
        updateCount: 0,
        unchangedCount: 1,
      },
      {
        file: 'assets',
        createCount: 0,
        updateCount: 0,
        unchangedCount: 1,
      },
      {
        file: 'transactions',
        createCount: 0,
        updateCount: 0,
        unchangedCount: 1,
      },
    ]);
  });

  it('rejects applying a failed preview batch', async () => {
    prisma.importBatch.findFirst.mockResolvedValue(
      createImportBatch({
        status: ImportBatchStatus.FAILED,
      }),
    );

    await expect(
      service.applyBatch(OWNER_ID, 'batch-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a live preview payload to apply a batch', async () => {
    prisma.importBatch.findFirst.mockResolvedValue(createImportBatch());

    await expect(
      service.applyBatch(OWNER_ID, 'batch-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a preview batch after a service restart when payload is persisted', async () => {
    const preview = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(
          'importKey,name,type,currency,institution,notes,order,archived\nchecking,Checking,BANK,EUR,,,0,false\n',
        ),
      },
    });

    const createdBatch = createImportBatch({
      id: preview.id,
      payloadJson: nthCallArg<ImportBatchCreateCall>(
        prisma.importBatch.create,
        0,
      ).data.payloadJson,
    });

    prisma.importBatch.findFirst.mockResolvedValue(createdBatch);
    prisma.account.create.mockResolvedValue(createImportedAccount());

    const restartedService = new ImportsService(
      prisma as unknown as PrismaService,
      prices as unknown as PricesService,
    );

    const result = await restartedService.applyBatch(OWNER_ID, preview.id);

    expect(result.status).toBe('APPLIED');
    expect(prisma.account.create).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized import keys during preview before persistence', async () => {
    const result = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(
          `importKey,name,type,currency,institution,notes,order,archived\n${'x'.repeat(129)},Checking,BANK,EUR,,,0,false\n`,
        ),
      },
    });

    expect(result.canApply).toBe(false);
    expect(result.issues[0]?.message).toContain('importKey is too long');
  });

  it('accepts 240-character transaction descriptions during preview', async () => {
    prisma.account.findMany.mockResolvedValue([createImportedAccount()]);

    const description = 'd'.repeat(240);
    const result = await service.previewCsv(OWNER_ID, {
      transactions: {
        originalName: 'transactions.csv',
        buffer: Buffer.from(
          `importKey,postedAt,kind,amount,description,notes,accountImportKey,direction,categoryImportKey,counterparty,sourceAccountImportKey,destinationAccountImportKey\nsalary-2026-04,2026-04-01T08:00:00.000Z,INCOME,5000,${description},,checking,INFLOW,,Employer,,\n`,
        ),
      },
    });

    expect(result.canApply).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('restores spreadsheet-safe apostrophe escapes during preview', async () => {
    const result = await service.previewCsv(OWNER_ID, {
      accounts: {
        originalName: 'accounts.csv',
        buffer: Buffer.from(
          "importKey,name,type,currency,institution,notes,order,archived\nchecking,'=1+1,BANK,EUR,,'+SUM,0,false\n",
        ),
      },
    });

    expect(result.canApply).toBe(true);
    expect(
      nthCallArg<ImportBatchCreateCall>(prisma.importBatch.create, 0).data
        .payloadJson,
    ).toEqual({
      providedFiles: ['accounts'],
      accounts: [
        {
          rowNumber: 2,
          importKey: 'checking',
          name: '=1+1',
          type: 'BANK',
          currency: 'EUR',
          institution: null,
          notes: '+SUM',
          order: 0,
          archived: false,
        },
      ],
      categories: [],
      assets: [],
      transactions: [],
    });
  });
});
