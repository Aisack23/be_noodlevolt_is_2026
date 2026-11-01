
import { Module } from '@nestjs/common';
import { AccountRepository } from '@AccountsOrders/repositories';
import { OrderRepository } from '@AccountsOrders/repositories';
import { OrderItemRepository } from '@AccountsOrders/repositories';
import { OrderStatusHistoryRepository } from '@AccountsOrders/repositories';

@Module({
  providers: [
    AccountRepository,
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
  ],
  exports: [
    AccountRepository,
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
  ],
})
export class AccountsOrdersModule {}
