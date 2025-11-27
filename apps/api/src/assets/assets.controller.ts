import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Patch } from '@nestjs/common/decorators';
import { AssetsService } from '@assets/assets.service';
import { CreateAssetDto } from '@assets/dto/create-asset.dto';
import { UpdateAssetDto } from '@assets/dto/update-asset.dto';
import { Asset } from '@prisma/client';

@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Get()
  async findAll(): Promise<Asset[]> {
    return this.assetsService.findAll();
  }

  @Post()
  async create(@Body() dto: CreateAssetDto): Promise<Asset> {
    return this.assetsService.create(dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<void> {
    return this.assetsService.remove(id);
  }

  @Get('summary')
  async getSummary() {
    return this.assetsService.getSummary();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.assetsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetsService.update(id, dto);
  }
}