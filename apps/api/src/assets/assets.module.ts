import { Module } from '@nestjs/common';
import { AssetsService } from '@assets/assets.service';
import { AssetsController } from '@assets/assets.controller';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AssetsModule {}