import { Module } from '@nestjs/common';
import { AccountsOrdersModule } from '@AccountsOrders';
import { KitchenController } from './controllers/kitchen.controller.js';
import { KitchenService } from './services/kitchen.service.js';

@Module({
  imports: [AccountsOrdersModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
