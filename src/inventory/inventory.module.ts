import { Module } from '@nestjs/common';
import {
  IngredientRepository,
  BranchIngredientRepository,
  InventoryMovementRepository,
} from '@Inventory/repositories';

@Module({
  providers: [
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
  ],
  exports: [
    IngredientRepository,
    BranchIngredientRepository,
    InventoryMovementRepository,
  ],
})
export class InventoryModule {}