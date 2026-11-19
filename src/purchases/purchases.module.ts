import { Module } from '@nestjs/common';
import {
  PurchaseRepository,
  PurchaseDetailRepository,
} from '@Purchase/repositories';

import { InventoryModule } from '../inventory/inventory.module.js';
import { PurchasesController } from './controllers/purchases.controller.js';
import { PurchasesService } from './services/purchases.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController],
  providers: [
    PurchasesService,
    PurchaseRepository,
    PurchaseDetailRepository,
  ],
  exports: [
    PurchaseRepository,
    PurchaseDetailRepository,
  ],
})
export class PurchasesModule {}