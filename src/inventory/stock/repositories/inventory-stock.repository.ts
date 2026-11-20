import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma } from '@PrismaClient';
import { BranchNotFoundError } from '../errors/index.js';
import type { InventoryStockItem } from '../types/index.js';

@Injectable()
export class InventoryStockRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByBranch(branchId: string): Promise<InventoryStockItem[]> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new BranchNotFoundError(branchId);
    return this.findItems({ branchId });
  }

  findInActiveBranches(): Promise<InventoryStockItem[]> {
    return this.findItems({ branch: { isActive: true } });
  }

  private async findItems(
    scope: Prisma.BranchIngredientWhereInput,
  ): Promise<InventoryStockItem[]> {
    const rows = await this.prisma.branchIngredient.findMany({
      where: { ...scope, isActive: true, ingredient: { isActive: true } },
      select: {
        id: true,
        branchId: true,
        currentStock: true,
        minimumStock: true,
        updatedAt: true,
        branch: { select: { name: true } },
        ingredient: { select: { name: true, unit: true } },
      },
      orderBy: [
        { branch: { name: 'asc' } },
        { ingredient: { name: 'asc' } },
        { id: 'asc' },
      ],
    });
    return rows.map(({ branch, ingredient, ...item }) => ({
      ...item,
      branchName: branch.name,
      name: ingredient.name,
      unit: ingredient.unit,
    }));
  }
}
