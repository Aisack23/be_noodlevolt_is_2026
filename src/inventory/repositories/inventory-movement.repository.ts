import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  InventoryMovement,
  InventoryMovementType,
  Prisma,
} from '@PrismaClient';

export interface CreateInventoryMovementData {
  branchIngredientId: string;
  type: InventoryMovementType;
  quantity: Prisma.Decimal | number;
  previousStock: Prisma.Decimal | number;
  resultingStock: Prisma.Decimal | number;
  purchaseId?: string | null;
  orderId?: string | null;
  userId?: string | null;
  note?: string | null;
  createdAt?: Date;
}

@Injectable()
export class InventoryMovementRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateInventoryMovementData): Promise<InventoryMovement> {
    return this.prisma.inventoryMovement.create({ data });
  }

  createMany(
    data: CreateInventoryMovementData[],
  ): Promise<{ count: number }> {
    return this.prisma.inventoryMovement.createMany({ data });
  }

  findById(id: string): Promise<InventoryMovement | null> {
    return this.prisma.inventoryMovement.findUnique({
      where: { id },
    });
  }

  findByBranchIngredient(
    branchIngredientId: string,
  ): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { branchIngredientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByOrder(orderId: string): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByPurchase(purchaseId: string): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { purchaseId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByUser(userId: string): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByType(type: InventoryMovementType): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByBranchIngredientAndDateRange(
    branchIngredientId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<InventoryMovement[]> {
    return this.prisma.inventoryMovement.findMany({
      where: {
        branchIngredientId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}