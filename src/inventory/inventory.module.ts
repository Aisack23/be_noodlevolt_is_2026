import { Module } from '@nestjs/common';
import { IngredientAvailabilityRepository } from './stock/repositories/ingredient-availability.repository.js';
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
    IngredientAvailabilityRepository,
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
    InventoryStockRepository,
    InventoryStockService,
  ],
  exports: [
    IngredientAvailabilityRepository,
    InventoryStockService,
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
  ],
})
export class InventoryModule {}