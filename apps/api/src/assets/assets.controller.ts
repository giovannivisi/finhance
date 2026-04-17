import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import type {
  AssetResponse,
  DashboardAssetResponse,
  DashboardSummary,
  RefreshAssetsResponse,
} from '@finhance/shared';
import { toAssetResponse } from '@assets/assets.mapper';

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
  async findAll(): Promise<AssetResponse[]> {
    const assets = await this.assetsService.findAll(this.resolveOwnerId());
    return assets.map(toAssetResponse);
  }

  @Get('with-values')
  async findAllWithValues(): Promise<DashboardAssetResponse[]> {
    return this.assetsService.findAllWithCurrentValue(this.resolveOwnerId());
  }

  @Get('summary')
  async getSummary(): Promise<DashboardSummary> {
    return this.assetsService.getSummary(this.resolveOwnerId());
  }

  @Post('refresh')
  async refreshAssets(): Promise<RefreshAssetsResponse> {
    return this.assetsService.refreshAssets(this.resolveOwnerId());
  }

  @Post()
  async create(@Body() dto: CreateAssetDto): Promise<AssetResponse> {
    const asset = await this.assetsService.create(this.resolveOwnerId(), dto);
    return toAssetResponse(asset);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<AssetResponse> {
    const asset = await this.assetsService.findOne(this.resolveOwnerId(), id);
    return toAssetResponse(asset);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ): Promise<AssetResponse> {
    const asset = await this.assetsService.update(
      this.resolveOwnerId(),
      id,
      dto,
    );
    return toAssetResponse(asset);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.assetsService.remove(this.resolveOwnerId(), id);
  }
}
