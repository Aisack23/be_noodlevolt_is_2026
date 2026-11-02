import { Module } from '@nestjs/common';
import {
  PurchaseRepository,
  PurchaseDetailRepository,
} from '@Purchase/repositories';

@Module({
  providers: [
    PurchaseRepository,
    PurchaseDetailRepository,
  ],
  exports: [
    PurchaseRepository,
    PurchaseDetailRepository,
  ],
})
export class PurchasesModule {}