import type { Prisma } from '@PrismaClient';

export interface InventoryStockItem {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  unit: string;
  currentStock: Prisma.Decimal;
  minimumStock: Prisma.Decimal;
  updatedAt: Date;
}
