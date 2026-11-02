import { Module } from '@nestjs/common';
import {
  CategoryRepository,
  DishRepository,
} from '@Catalog/repositories';

@Module({
  providers: [CategoryRepository, DishRepository],
  exports: [CategoryRepository, DishRepository],
})
export class CatalogModule {}