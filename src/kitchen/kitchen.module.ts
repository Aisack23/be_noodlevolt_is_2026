import { Module } from '@nestjs/common';
import { AccountsOrdersModule } from '@AccountsOrders';
import { KitchenController } from '@Kitchen/controllers';
import { KitchenService } from '@Kitchen/services';

@Module({
  imports: [AccountsOrdersModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
