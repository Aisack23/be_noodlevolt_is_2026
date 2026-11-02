import { Module } from '@nestjs/common';
import { CategoryRepository, DishRepository } from '@Catalog/repositories';
import {
  AlwaysSufficientIngredientChecker,
  INGREDIENT_AVAILABILITY_CHECKER,
  MenuController,
  MenuRepository,
  MenuService,
} from '@Catalog/menu';

@Module({
  controllers: [MenuController],
  providers: [
    CategoryRepository,
    DishRepository,
    MenuRepository,
    MenuService,
    {
      provide: INGREDIENT_AVAILABILITY_CHECKER,
      useClass: AlwaysSufficientIngredientChecker,
    },
  ],
  exports: [CategoryRepository, DishRepository],
})
export class CatalogModule {}
