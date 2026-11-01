
import { Module } from '@nestjs/common';
import { AccountRepository } from '@AccountsOrders/repositories';
import { OrderRepository } from '@AccountsOrders/repositories';

@Module({
  providers: [AccountRepository, OrderRepository],
  exports: [AccountRepository, OrderRepository],
})
export class AccountsOrdersModule {}
