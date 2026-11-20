import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { User } from '@PrismaClient';
import { Prisma } from '@PrismaClient';
import { InventoryStockService } from '../../inventory/stock/services/inventory-stock.service.js';
import type { PageQueryDto } from '../../common/dto/page-query.dto.js';
import type { CreatePurchaseDto } from '../dto/purchase.dto.js';
import { PurchaseRepository } from '../repositories/purchase.repository.js';

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(PurchaseRepository) private readonly purchases: PurchaseRepository,
    @Inject(InventoryStockService) private readonly stock: InventoryStockService,
  ) {}

  async lowStock(actor: User) {
    this.requireBranch(actor);
    return (await this.stock.getInventory(actor, undefined)).filter((item) => item.isLowStock);
  }

  list(actor: User, pagination: PageQueryDto) {
    return this.purchases.list(this.requireBranch(actor), pagination);
  }

  async create(actor: User, input: CreatePurchaseDto) {
    const branchId = this.requireBranch(actor);
    const lines = input.lines.map((line) => ({ ...line, branchIngredientId: line.branchIngredientId.toLowerCase() }));
    if (new Set(lines.map((line) => line.branchIngredientId)).size !== lines.length)
      throw new BadRequestException('Cada insumo debe aparecer una vez en la compra.');
    try {
      const created = await this.purchases.receive(branchId, actor.id, { ...input, lines });
      if (!created) throw new NotFoundException('La sucursal no está disponible.');
      return created;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('La factura ya está registrada en esta sucursal.');
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2025' || error.code === 'P2000'))
        throw new ConflictException('Un insumo no está activo en la sucursal o excede el límite de existencias.');
      throw error;
    }
  }

  private requireBranch(actor: User): string {
    if (actor.role !== 'BRANCH_ADMIN' || !actor.branchId)
      throw new ForbiddenException('Se requiere gerencia de la sucursal para acceder a compras.');
    return actor.branchId;
  }
}
