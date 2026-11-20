
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type Recipe } from '@PrismaClient';

export interface CreateRecipeData {
  dishId: string;
  ingredientId: string;
  quantity: Prisma.Decimal | number;
}

export interface UpdateRecipeData {
  quantity: Prisma.Decimal | number;
}

@Injectable()
export class RecipeRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateRecipeData): Promise<Recipe> {
    return this.prisma.recipe.create({
      data,
    });
  }

  findByDishAndIngredient(
    dishId: string,
    ingredientId: string,
  ): Promise<Recipe | null> {
    return this.prisma.recipe.findUnique({
      where: {
        dishId_ingredientId: {
          dishId,
          ingredientId,
        },
      },
    });
  }

  findByDish(dishId: string): Promise<Recipe[]> {
    return this.prisma.recipe.findMany({
      where: { dishId },
      orderBy: { ingredient: { name: 'asc' } },
    });
  }

  findByIngredient(ingredientId: string): Promise<Recipe[]> {
    return this.prisma.recipe.findMany({
      where: { ingredientId },
      orderBy: { dish: { name: 'asc' } },
    });
  }

  update(
    dishId: string,
    ingredientId: string,
    data: UpdateRecipeData,
  ): Promise<Recipe> {
    return this.prisma.recipe.update({
      where: {
        dishId_ingredientId: {
          dishId,
          ingredientId,
        },
      },
      data,
    });
  }

  delete(
    dishId: string,
    ingredientId: string,
  ): Promise<Recipe> {
    return this.prisma.recipe.delete({
      where: {
        dishId_ingredientId: {
          dishId,
          ingredientId,
        },
      },
    });
  }
}
