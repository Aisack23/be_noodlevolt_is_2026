import { Module } from '@nestjs/common';
import { CatalogModule } from '@Catalog';
import { NoopInventoryConsumer } from './adapters/index.js';
import { TakeoutOrderController } from './controllers/index.js';
import { INVENTORY_CONSUMER } from './ports/index.js';
import { TakeoutOrderRepository } from './repositories/index.js';
import { TakeoutOrderService } from './services/index.js';

@Module({
  imports: [CatalogModule],
  controllers: [TakeoutOrderController],
  providers: [
    TakeoutOrderRepository,
    TakeoutOrderService,
    { provide: INVENTORY_CONSUMER, useClass: NoopInventoryConsumer },
  ],
})
export class TakeoutOrdersModule {}
