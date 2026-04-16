import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { DashboardAssetView, DashboardSummary, RefreshAssetsResponse } from '@assets/assets.types';
import { Asset } from '@prisma/client';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  async findAll(): Promise<Asset[]> {
    return this.assetsService.findAll();
  }

  @Get('with-values')
  async findAllWithValues(): Promise<DashboardAssetView[]> {
    return this.assetsService.findAllWithCurrentValue();
  }

  @Get('summary')
  async getSummary(): Promise<DashboardSummary> {
    return this.assetsService.getSummary();
  }

  @Post('refresh')
  async refreshAssets(): Promise<RefreshAssetsResponse> {
    return this.assetsService.refreshAssets();
  }

  @Post()
  async create(@Body() dto: CreateAssetDto): Promise<Asset> {
    return this.assetsService.create(dto);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Asset> {
    return this.assetsService.findOne(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto): Promise<Asset> {
    return this.assetsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.assetsService.remove(id);
  }
}
