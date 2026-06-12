import { Module } from '@nestjs/common';
import { PrismaModule } from '@prisma/prisma.module';
import { RequestOwnerResolver } from '@/security/request-owner.resolver';
import { UsersController } from '@/users/users.controller';
import { UsersService } from '@/users/users.service';

@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersService, RequestOwnerResolver],
  exports: [UsersService],
})
export class UsersModule {}
