import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import {
  DashboardAssetView,
  DashboardSummary,
  REFRESH_COOLDOWN_MS,
  RefreshAssetsResponse,
} from '@assets/assets.types';
import { Asset } from '@prisma/client';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

@Controller('assets')
export class AssetsController {
  constructor(
    private readonly assetsService: AssetsService,
    private readonly requestOwnerResolver: RequestOwnerResolver,
  ) {}

  private resolveOwnerId(): string {
    return this.requestOwnerResolver.resolveOwnerId();
  }

  @Get()
  async findAll(): Promise<Asset[]> {
    return this.assetsService.findAll(this.resolveOwnerId());
  }

  @Get('with-values')
  async findAllWithValues(): Promise<DashboardAssetView[]> {
    return this.assetsService.findAllWithCurrentValue(this.resolveOwnerId());
  }

  @Get('summary')
  async getSummary(): Promise<DashboardSummary> {
    return this.assetsService.getSummary(this.resolveOwnerId());
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: 1,
      ttl: REFRESH_COOLDOWN_MS,
    },
  })
  async refreshAssets(): Promise<RefreshAssetsResponse> {
    return this.assetsService.refreshAssets(this.resolveOwnerId());
  }

  @Post()
  async create(@Body() dto: CreateAssetDto): Promise<Asset> {
    return this.assetsService.create(this.resolveOwnerId(), dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Asset> {
    return this.assetsService.findOne(this.resolveOwnerId(), id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<Asset> {
    return this.assetsService.update(this.resolveOwnerId(), id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.assetsService.remove(this.resolveOwnerId(), id);
  }
}
