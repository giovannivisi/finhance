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

  private async computeCurrentValue(asset: Asset): Promise<number> {
    const storedBalance = Number(asset.balance);

    const isMarketAsset =
      asset.type === 'ASSET' &&
      ['STOCK', 'BOND', 'CRYPTO'].includes(asset.kind ?? '');

    if (!isMarketAsset || !asset.ticker || !asset.quantity) {
      return storedBalance;
    }

    const yahooTicker = asset.exchange === "_CRYPTO_"
                          ? asset.ticker
                          : `${asset.ticker}${asset.exchange ?? ''}`;

    const livePrice = await this.pricesService.getLivePrice(yahooTicker);

    if (livePrice != null) {
      return Number(asset.quantity) * livePrice;
    }

    // fallback: stored unitPrice if Yahoo fails
    if (asset.unitPrice) {
      return Number(asset.quantity) * Number(asset.unitPrice);
    }

    return storedBalance;
  }

  async findAll(): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }
  async findAllWithCurrentValue(): Promise<(Asset & { currentValue: number })[]> {
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
    let computedBalance: number;

    if (["STOCK", "BOND", "CRYPTO"].includes(dto.kind!)) {
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

  async getSummary() {
    const assets = await this.prisma.asset.findMany();

    // compute all values in parallel
    const values = await Promise.all(
      assets.map(a => this.computeCurrentValue(a))
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

    if (["STOCK", "BOND", "CRYPTO"].includes(dto.kind!)) {
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