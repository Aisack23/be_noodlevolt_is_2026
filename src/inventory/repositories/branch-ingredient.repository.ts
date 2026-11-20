
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  type BranchIngredient,
} from '@PrismaClient';

export interface CreateBranchIngredientData {
  branchId: string;
  ingredientId: string;
  currentStock?: Prisma.Decimal | number;
  minimumStock?: Prisma.Decimal | number;
}

export interface UpdateBranchIngredientData {
  currentStock?: Prisma.Decimal | number;
  minimumStock?: Prisma.Decimal | number;
}

@Injectable()
export class BranchIngredientRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateBranchIngredientData): Promise<BranchIngredient> {
    return this.prisma.branchIngredient.create({
      data,
    });
  }

  findById(id: string): Promise<BranchIngredient | null> {
    return this.prisma.branchIngredient.findUnique({
      where: { id },
    });
  }

  findByBranchAndIngredient(
    branchId: string,
    ingredientId: string,
  ): Promise<BranchIngredient | null> {
    return this.prisma.branchIngredient.findUnique({
      where: {
        branchId_ingredientId: {
          branchId,
          ingredientId,
        },
      },
    });
  }

  findByBranch(branchId: string): Promise<BranchIngredient[]> {
    return this.prisma.branchIngredient.findMany({
      where: { branchId },
      orderBy: { ingredient: { name: 'asc' } },
    });
  }

  findActiveByBranch(branchId: string): Promise<BranchIngredient[]> {
    return this.prisma.branchIngredient.findMany({
      where: {
        branchId,
        isActive: true,
        ingredient: { isActive: true },
      },
      orderBy: { ingredient: { name: 'asc' } },
    });
  }

  findLowStockByBranch(branchId: string): Promise<BranchIngredient[]> {
    return this.prisma.branchIngredient.findMany({
      where: {
        branchId,
        isActive: true,
        currentStock: {
          lte: this.prisma.branchIngredient.fields.minimumStock,
        },
      },
      orderBy: { currentStock: 'asc' },
    });
  }

  update(
    id: string,
    data: UpdateBranchIngredientData,
  ): Promise<BranchIngredient> {
    return this.prisma.branchIngredient.update({
      where: { id },
      data,
    });
  }

  setActive(id: string, isActive: boolean): Promise<BranchIngredient> {
    return this.prisma.branchIngredient.update({
      where: { id },
      data: { isActive },
    });
  }
}
