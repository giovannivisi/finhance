import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { Asset, AssetType, Prisma } from '@prisma/client';
import { PricesService } from '@prices/prices.service';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricesService: PricesService
  ) {}

  private async computeCurrentValue(asset: Asset, opts?: { forceRefresh?: boolean }): Promise<number> {
    // liabilities & cash-like assets
    if (asset.type === "LIABILITY" || !asset.kind) {
      return Number(asset.balance ?? 0);
    }

    const isMarket =
      ["STOCK", "BOND", "CRYPTO"].includes(asset.kind);

    if (!isMarket || !asset.quantity) {
      return Number(asset.balance ?? 0);
    }

    const qty = Number(asset.quantity);

    if (!asset.ticker) {
      return Number(asset.balance ?? 0);
    }

    // build Yahoo symbol
    const yahooTicker =
      asset.exchange === "_CRYPTO_"
        ? asset.ticker
        : `${asset.ticker}${asset.exchange ?? ""}`;

    // 1️⃣ Live price fetch
    const livePrice = await this.pricesService.getLivePrice(yahooTicker, {
      forceRefresh: opts?.forceRefresh,
    });

    if (typeof livePrice === "number") {
      // cache it
      await this.prisma.asset.update({
        where: { id: asset.id },
        data: {
          lastPrice: livePrice,
          lastPriceAt: new Date(),
        },
      });

      return qty * livePrice;
    }

    // 2️⃣ Cached price fallback
    if (asset.lastPrice) {
      return qty * Number(asset.lastPrice);
    }

    // 3️⃣ Avg buy-in fallback
    if (asset.unitPrice) {
      return qty * Number(asset.unitPrice);
    }

    return 0;
  }

  async findAll(): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }
  async findAllWithCurrentValue(forceRefresh?: boolean): Promise<(Asset & { currentValue: number | null })[]> {
    const assets = await this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const values = await Promise.all(
      assets.map(a => this.computeCurrentValue(a))
    );

    return assets.map((asset, idx) => ({
      ...asset,
      currentValue: values[idx],
    }));
  }

  async create(dto: CreateAssetDto): Promise<Asset> {
    const isLiability = dto.type === AssetType.LIABILITY;

    // LIABILITY LOGIC
    if (isLiability) {
      return this.prisma.asset.create({
        data: {
          userId: dto.userId ?? null,
          name: dto.name,
          type: AssetType.LIABILITY,
          liabilityKind: dto.liabilityKind,
          balance: new Prisma.Decimal(dto.balance!),
          currency: dto.currency ?? 'EUR',

          // Null-out asset-only fields
          kind: null,
          ticker: null,
          exchange: null,
          quantity: null,
          unitPrice: null,

          notes: dto.notes ?? null,
          order: dto.order ?? 0,
        }
      });
    }

    // ASSET LOGIC
    const isMarket = ["STOCK", "BOND", "CRYPTO"].includes(dto.kind!);

    // Merge-on-create for market positions (single row per ticker+exchange)
    if (
      isMarket &&
      dto.ticker &&
      dto.quantity != null &&
      dto.unitPrice != null
    ) {
      const existing = await this.prisma.asset.findFirst({
        where: {
          type: AssetType.ASSET,
          kind: dto.kind!,
          ticker: dto.ticker,
          exchange: dto.exchange ?? null,
          userId: dto.userId ?? null,
        },
      });

      if (existing) {
        const oldQty = Number(existing.quantity ?? 0);
        const oldAvg = Number(existing.unitPrice ?? 0);
        const buyQty = Number(dto.quantity);
        const buyPrice = Number(dto.unitPrice);

        const newQty = oldQty + buyQty;
        const newAvg = newQty > 0 ? (oldQty * oldAvg + buyQty * buyPrice) / newQty : buyPrice;
        const newBalance = newQty * newAvg; // reference fallback (avg cost)

        return this.prisma.asset.update({
          where: { id: existing.id },
          data: {
            // Keep existing name if user is just adding more; otherwise allow updating it via dto
            name: dto.name ?? existing.name,
            quantity: new Prisma.Decimal(newQty),
            unitPrice: new Prisma.Decimal(newAvg),
            balance: new Prisma.Decimal(newBalance),
            currency: dto.currency ?? existing.currency,
            notes: dto.notes ?? existing.notes,
            order: dto.order ?? existing.order,
          },
        });
      }
    }

    let computedBalance
    if (isMarket) {
      computedBalance = Number(dto.quantity) * Number(dto.unitPrice);
    } else {
      computedBalance = Number(dto.balance);
    }

    return this.prisma.asset.create({
      data: {
        userId: dto.userId ?? null,
        name: dto.name,
        type: AssetType.ASSET,
        kind: dto.kind!,
        liabilityKind: null,
        ticker: dto.ticker ?? null,
        exchange: dto.exchange ?? null,
        quantity: dto.quantity ? new Prisma.Decimal(dto.quantity) : null,
        unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
        balance: new Prisma.Decimal(computedBalance),
        currency: dto.currency ?? 'EUR',
        notes: dto.notes ?? null,
        order: dto.order ?? 0,
      }
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.asset.delete({ where: { id } });
  }

  async getSummary(forceRefresh?: boolean) {
    const assets = await this.prisma.asset.findMany();

    // compute all values in parallel
    const values = await Promise.all(
      assets.map(a => this.computeCurrentValue(a, { forceRefresh }))
    );

    let assetsTotal = 0;
    let liabilitiesTotal = 0;

    assets.forEach((asset, idx) => {
      const value = values[idx];

      if (asset.type === 'ASSET') {
        assetsTotal += value;
      } else {
        liabilitiesTotal += Number(asset.balance);
      }
    });

    return {
      assets: assetsTotal,
      liabilities: liabilitiesTotal,
      netWorth: assetsTotal - liabilitiesTotal,
    };
  }

  async findOne(id: string) {
    return this.prisma.asset.findUnique({
      where: { id },
    });
  }

  async update(id: string, dto: UpdateAssetDto) {
    const isLiability = dto.type === AssetType.LIABILITY;

    if (isLiability) {
      return this.prisma.asset.update({
        where: { id },
        data: {
          name: dto.name,
          type: AssetType.LIABILITY,
          liabilityKind: dto.liabilityKind,
          balance: new Prisma.Decimal(dto.balance!),

          // Null-out asset fields
          kind: null,
          ticker: null,
          exchange: null,
          quantity: null,
          unitPrice: null,

          notes: dto.notes ?? null,
          order: dto.order ?? 0,
          currency: dto.currency ?? 'EUR',
        }
      });
    }

    // ASSET UPDATE LOGIC
    let computedBalance: number;

    const isMarketUpdate = ["STOCK", "BOND", "CRYPTO"].includes(dto.kind!);
    if (isMarketUpdate && dto.ticker) {
      const dup = await this.prisma.asset.findFirst({
        where: {
          id: { not: id },
          type: AssetType.ASSET,
          kind: dto.kind!,
          ticker: dto.ticker,
          exchange: dto.exchange ?? null,
          userId: (dto as any).userId ?? null,
        },
      });
      if (dup) {
        throw new Error(
          `Duplicate position: an asset with ${dto.ticker}${dto.exchange ?? ""} already exists.`
        );
      }
    }

    if (isMarketUpdate) {
      computedBalance = Number(dto.quantity) * Number(dto.unitPrice);
    } else {
      computedBalance = Number(dto.balance);
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        name: dto.name,
        type: AssetType.ASSET,
        kind: dto.kind!,
        liabilityKind: null,
        ticker: dto.ticker ?? null,
        exchange: dto.exchange ?? null,
        quantity: dto.quantity ? new Prisma.Decimal(dto.quantity) : null,
        unitPrice: dto.unitPrice ? new Prisma.Decimal(dto.unitPrice) : null,
        balance: new Prisma.Decimal(computedBalance),
        notes: dto.notes ?? null,
        order: dto.order ?? 0,
        currency: dto.currency ?? 'EUR',
      }
    });
  }
}