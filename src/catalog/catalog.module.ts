import { DishesController } from './menu/controllers/dishes.controller.js';
import { Module } from '@nestjs/common';
import { CategoryRepository, DishRepository } from '@Catalog/repositories';
import {
  INGREDIENT_AVAILABILITY_CHECKER,
  MenuController,
  MenuRepository,
  MenuService,
} from '@Catalog/menu';

import { InventoryModule } from '../inventory/inventory.module.js';
import { IngredientAvailabilityRepository } from '../inventory/stock/repositories/ingredient-availability.repository.js';

@Module({
  imports: [InventoryModule],
  controllers: [MenuController, DishesController],
  providers: [
    CategoryRepository,
    DishRepository,
    MenuRepository,
    MenuService,
    {
      provide: INGREDIENT_AVAILABILITY_CHECKER,
      useExisting: IngredientAvailabilityRepository,
    },
  ],
  exports: [CategoryRepository, DishRepository],
})
export class CatalogModule {}
