
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { type Purchase } from '@PrismaClient';

export interface CreatePurchaseData {
  branchId: string;
  supplier: string;
  purchasedAt?: Date;
  invoiceNumber?: string;
}

export interface UpdatePurchaseData {
  supplier?: string;
  purchasedAt?: Date;
  invoiceNumber?: string | null;
}

@Injectable()
export class PurchaseRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePurchaseData): Promise<Purchase> {
    return this.prisma.purchase.create({
      data,
    });
  }

  findById(id: string): Promise<Purchase | null> {
    return this.prisma.purchase.findUnique({
      where: { id },
    });
  }

  findByBranch(branchId: string): Promise<Purchase[]> {
    return this.prisma.purchase.findMany({
      where: { branchId },
      orderBy: { purchasedAt: 'desc' },
    });
  }

  findByBranchAndInvoice(
    branchId: string,
    invoiceNumber: string,
  ): Promise<Purchase | null> {
    return this.prisma.purchase.findUnique({
      where: {
        branchId_invoiceNumber: {
          branchId,
          invoiceNumber,
        },
      },
    });
  }

  update(id: string, data: UpdatePurchaseData): Promise<Purchase> {
    return this.prisma.purchase.update({
      where: { id },
      data,
    });
  }
}
