import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from '@/request-safety/idempotency.service';
import { OperationLockService } from '@/request-safety/operation-lock.service';

@Global()
@Module({
  providers: [IdempotencyService, OperationLockService],
  exports: [IdempotencyService, OperationLockService],
})
export class RequestSafetyModule {}
