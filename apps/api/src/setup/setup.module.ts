import { Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { PrismaModule } from '@prisma/prisma.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupController } from '@/setup/setup.controller';
import { SetupService } from '@/setup/setup.service';

@Module({
  imports: [PrismaModule, AccountsModule],
  controllers: [SetupController],
  providers: [SetupService, RequestOwnerResolver],
})
export class SetupModule {}
