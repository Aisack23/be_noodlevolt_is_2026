import { Module } from '@nestjs/common';
import {
  IngredientRepository,
  BranchIngredientRepository,
} from '@Inventory/repositories';

@Module({
  providers: [
    IngredientRepository,
    BranchIngredientRepository,
  ],
  exports: [
    IngredientRepository,
    BranchIngredientRepository,
  ],
})
export class InventoryModule {}