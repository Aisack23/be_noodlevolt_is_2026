
import { Module } from '@nestjs/common';
import { AccountRepository } from '@AccountsOrders/repositories';
import { OrderRepository } from '@AccountsOrders/repositories';
import { OrderItemRepository } from '@AccountsOrders/repositories';
import { OrderStatusHistoryRepository } from '@AccountsOrders/repositories';
import { MyOrdersController } from './controllers/my-orders.controller.js';
import { MyOrdersService } from './services/my-orders.service.js';

@Module({
  controllers: [MyOrdersController],
  providers: [
    AccountRepository,
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
    MyOrdersService,
  ],
  exports: [
    AccountRepository,
    OrderRepository,
    OrderItemRepository,
    OrderStatusHistoryRepository,
    MyOrdersService,
  ],
})
export class AccountsOrdersModule {}
