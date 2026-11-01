
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  type PurchaseDetail,
} from '@PrismaClient';

export interface CreatePurchaseDetailData {
  purchaseId: string;
  branchIngredientId: string;
  quantity: Prisma.Decimal | number;
  unitCost: Prisma.Decimal | number;
  expirationDate?: Date | null;
}

export interface UpdatePurchaseDetailData {
  quantity?: Prisma.Decimal | number;
  unitCost?: Prisma.Decimal | number;
  expirationDate?: Date | null;
}

@Injectable()
export class PurchaseDetailRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePurchaseDetailData): Promise<PurchaseDetail> {
    return this.prisma.purchaseDetail.create({
      data,
    });
  }

  findById(id: string): Promise<PurchaseDetail | null> {
    return this.prisma.purchaseDetail.findUnique({
      where: { id },
    });
  }

  findByPurchase(purchaseId: string): Promise<PurchaseDetail[]> {
    return this.prisma.purchaseDetail.findMany({
      where: { purchaseId },
      orderBy: { id: 'asc' },
    });
  }

  findByBranchIngredient(
    branchIngredientId: string,
  ): Promise<PurchaseDetail[]> {
    return this.prisma.purchaseDetail.findMany({
      where: { branchIngredientId },
      orderBy: { purchase: { purchasedAt: 'desc' } },
    });
  }

  update(
    id: string,
    data: UpdatePurchaseDetailData,
  ): Promise<PurchaseDetail> {
    return this.prisma.purchaseDetail.update({
      where: { id },
      data,
    });
  }

  deleteById(id: string): Promise<PurchaseDetail> {
    return this.prisma.purchaseDetail.delete({
      where: { id },
    });
  }
}
