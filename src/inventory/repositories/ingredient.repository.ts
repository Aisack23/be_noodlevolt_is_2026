
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type Ingredient } from '@PrismaClient';

export interface CreateIngredientData {
  name: string;
  unit: string;
}

export interface UpdateIngredientData {
  name?: string;
  unit?: string;
}

@Injectable()
export class IngredientRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateIngredientData): Promise<Ingredient> {
    return this.prisma.ingredient.create({
      data,
    });
  }

  findById(id: string): Promise<Ingredient | null> {
    return this.prisma.ingredient.findUnique({
      where: { id },
    });
  }

  findAll(): Promise<Ingredient[]> {
    return this.prisma.ingredient.findMany({
      orderBy: { name: 'asc' },
    });
  }

  findActive(): Promise<Ingredient[]> {
    return this.prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  update(
    id: string,
    data: UpdateIngredientData,
  ): Promise<Ingredient> {
    return this.prisma.ingredient.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<Ingredient> {
    return this.prisma.ingredient.update({
      where: { id },
      data: { isActive },
    });
  }
}
