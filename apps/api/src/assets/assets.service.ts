import { Injectable } from '@nestjs/common';
import { PrismaService } from '@prisma/prisma.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { Asset, AssetType } from '@prisma/client';

@Injectable()
export class AssetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      include: { category: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: CreateAssetDto): Promise<Asset> {
    const { userId, name, type, balance, currency } = dto;

    return this.prisma.asset.create({
      data: {
        userId: userId ?? null,
        name,
        type,
        balance,
        currency: currency ?? 'EUR',
        categoryId: dto.categoryId ?? null,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.asset.delete({ where: { id } });
  }

  async getSummary() {
    const assets = await this.prisma.asset.findMany();
    let ass = 0;
    let liabilities = 0;

    for (const asset of assets) {
      if (asset.type === 'ASSET') {
        ass += Number(asset.balance);
      } else if (asset.type === 'LIABILITY') {
        liabilities += Number(asset.balance);
      }
    }

    const netWorth = ass - liabilities;

    return {
      assets,
      liabilities,
      netWorth,
    };
  }

async findOne(id: string) {
  return this.prisma.asset.findUnique({
    where: { id },
  });
}

async update(id: string, dto: UpdateAssetDto) {
  return this.prisma.asset.update({
    where: { id },
    data: dto,
  });
}
}