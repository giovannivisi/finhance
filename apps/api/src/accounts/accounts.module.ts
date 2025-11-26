import { Module } from '@nestjs/common';
import { AccountsService } from '@accounts/accounts.service';
import { AccountsController } from '@accounts/accounts.controller';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService],
})
export class AccountsModule {}