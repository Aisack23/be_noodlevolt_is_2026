import { Module } from '@nestjs/common';
import {
  IngredientRepository,
  BranchIngredientRepository,
  InventoryMovementRepository,
} from '@Inventory/repositories';
import {
  InventoryStockController,
  InventoryStockRepository,
  InventoryStockService,
} from '@Inventory/stock';

@Module({
  controllers: [InventoryStockController],
  providers: [
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
    InventoryStockRepository,
    InventoryStockService,
  ],
  exports: [
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
  ],
})
export class InventoryModule {}