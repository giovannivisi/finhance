import { forwardRef, Module } from '@nestjs/common';
import { AccountsModule } from '@accounts/accounts.module';
import { PrismaModule } from '@prisma/prisma.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { SetupController } from '@/setup/setup.controller';
import { SetupService } from '@/setup/setup.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AccountsModule)],
  controllers: [SetupController],
  providers: [SetupService, RequestOwnerResolver],
  exports: [SetupService],
})
export class SetupModule {}
