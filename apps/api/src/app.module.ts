import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { AssetsModule } from '@assets/assets.module';

@Module({
  imports: [PrismaModule, AssetsModule],
})
export class AppModule {}
