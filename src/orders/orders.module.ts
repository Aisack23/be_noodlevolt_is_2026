import { Module } from '@nestjs/common';
import { OrdersController } from './controllers/orders.controller.js';
import { OrdersService } from './services/orders.service.js';
import { OrdersRepository } from './repositories/orders.repository.js';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
