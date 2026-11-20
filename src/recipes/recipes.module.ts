import { Module } from '@nestjs/common';
import { RecipeRepository } from '@Recipes/repositories';

@Module({
  providers: [RecipeRepository],
  exports: [RecipeRepository],
})
export class RecipesModule {}