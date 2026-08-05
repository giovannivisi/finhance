import { createRequire } from "node:module";
import { PrismaPg } from "@prisma/adapter-pg";

const require = createRequire(import.meta.url);
const generated = require("./generated/client/index.js");

function resolveConnectionString(options) {
  const connectionString =
    options?.datasourceUrl ??
    options?.datasources?.db?.url ??
    process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to create a Prisma client.");
  }

  return connectionString;
}

function resolveSchemaName(connectionString) {
  try {
    const schema = new URL(connectionString).searchParams.get("schema")?.trim();
    return schema || undefined;
  } catch {
    return undefined;
  }
}

function createPrismaAdapter(connectionString) {
  const schema = resolveSchemaName(connectionString);

  return new PrismaPg(
    {
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 300_000,
    },
    schema ? { schema } : undefined,
  );
}

function createPrismaClientOptions(options = {}) {
  if (options.adapter || options.accelerateUrl) {
    return options;
  }

  const { datasourceUrl, datasources, ...clientOptions } = options;

  return {
    ...clientOptions,
    adapter: createPrismaAdapter(resolveConnectionString(options)),
  };
}

class PrismaClient extends generated.PrismaClient {
  constructor(options = {}) {
    super(createPrismaClientOptions(options));
  }
}

const {
  $Enums,
  Prisma,
  AccountType,
  AssetKind,
  AssetType,
  BrokerageOperationKind,
  CategoryType,
  FxRateSource,
  IdempotencyRequestStatus,
  ImportBatchStatus,
  ImportSource,
  InvestmentPlanCadence,
  InvestmentPlanOccurrenceStatus,
  LiabilityKind,
  OperationType,
  RecurringOccurrenceStatus,
  TransactionDirection,
  TransactionKind,
} = generated;

export {
  $Enums,
  AccountType,
  AssetKind,
  AssetType,
  BrokerageOperationKind,
  CategoryType,
  FxRateSource,
  IdempotencyRequestStatus,
  ImportBatchStatus,
  ImportSource,
  InvestmentPlanCadence,
  InvestmentPlanOccurrenceStatus,
  LiabilityKind,
  OperationType,
  Prisma,
  PrismaClient,
  RecurringOccurrenceStatus,
  TransactionDirection,
  TransactionKind,
  createPrismaAdapter,
  createPrismaClientOptions,
};

export default {
  ...generated,
  PrismaClient,
  createPrismaAdapter,
  createPrismaClientOptions,
};
