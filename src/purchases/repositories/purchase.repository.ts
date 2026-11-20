
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma, type Purchase } from '@PrismaClient';
import { InventoryMovementRepository } from '../../inventory/repositories/inventory-movement.repository.js';
import type { PageQueryDto } from '../../common/dto/page-query.dto.js';
import type { CreatePurchaseDto, PurchaseResponseDto } from '../dto/purchase.dto.js';

const purchaseDetails = {
  details: {
    orderBy: { id: 'asc' },
    include: { branchIngredient: { select: { ingredient: { select: { name: true, unit: true } } } } },
  },
} as const satisfies Prisma.PurchaseInclude;

function toPurchaseResponse(
  purchase: Prisma.PurchaseGetPayload<{ include: typeof purchaseDetails }>,
): PurchaseResponseDto {
  return {
    id: purchase.id,
    supplier: purchase.supplier,
    invoiceNumber: purchase.invoiceNumber,
    purchasedAt: purchase.purchasedAt.toISOString(),
    details: purchase.details.map((detail) => ({
      id: detail.id,
      ingredientName: detail.branchIngredient.ingredient.name,
      unit: detail.branchIngredient.ingredient.unit,
      quantity: detail.quantity.toFixed(3),
      unitCost: detail.unitCost.toFixed(4),
      expirationDate: detail.expirationDate?.toISOString().slice(0, 10) ?? null,
    })),
  };
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly movements: InventoryMovementRepository,
  ) {}

  async list(branchId: string, { page, limit }: PageQueryDto) {
    const where = { branchId, branch: { isActive: true } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.purchase.findMany({
        where,
        include: purchaseDetails,
        orderBy: [{ purchasedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchase.count({ where }),
    ]);
    return { items: items.map(toPurchaseResponse), total, page, limit };
  }

  receive(branchId: string, userId: string, input: CreatePurchaseDto) {
    return this.prisma.$transaction(async (tx) => {
      const [activeBranch] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM branches WHERE id = ${branchId}::uuid AND is_active FOR SHARE
      `;
      if (!activeBranch) return null;
      const purchase = await tx.purchase.create({
        data: { branchId, supplier: input.supplier, invoiceNumber: input.invoiceNumber },
      });

      // Orden estable de bloqueo para compras concurrentes con insumos compartidos.
      const lines = [...input.lines].sort((left, right) => left.branchIngredientId.localeCompare(right.branchIngredientId));
      for (const line of lines) {
        const quantity = new Prisma.Decimal(line.quantity);
        const stock = await tx.branchIngredient.update({
          where: { id: line.branchIngredientId, branchId, isActive: true, ingredient: { isActive: true } },
          data: { currentStock: { increment: quantity } },
          select: { currentStock: true },
        });
        await tx.purchaseDetail.create({
          data: {
            purchaseId: purchase.id,
            branchIngredientId: line.branchIngredientId,
            quantity,
            unitCost: new Prisma.Decimal(line.unitCost),
            expirationDate: line.expirationDate ? new Date(line.expirationDate) : undefined,
          },
        });
        await this.movements.create({
          branchIngredientId: line.branchIngredientId,
          quantity,
          previousStock: stock.currentStock.sub(quantity),
          resultingStock: stock.currentStock,
          type: 'PURCHASE',
          purchaseId: purchase.id,
          userId,
        }, tx);
      }
      return toPurchaseResponse(await tx.purchase.findUniqueOrThrow({ where: { id: purchase.id }, include: purchaseDetails }));
    }, { timeout: 10000 });
  }

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
