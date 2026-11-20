import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '@PrismaClient';
import { InventoryItemResponseDto } from '../dto/index.js';
import { BranchNotFoundError } from '../errors/index.js';
import { InventoryStockRepository } from '../repositories/index.js';
import type { InventoryStockItem } from '../types/index.js';

type InventoryActor = Pick<User, 'role' | 'branchId'>;

const FORBIDDEN = 'No tiene permiso para consultar este inventario.';

@Injectable()
export class InventoryStockService {
  constructor(
    @Inject(InventoryStockRepository)
    private readonly repository: InventoryStockRepository,
  ) {}

  async getInventory(
    actor: InventoryActor,
    requestedBranchId: unknown,
  ): Promise<InventoryItemResponseDto[]> {
    // El valor recibido solo se compara: nunca llega al repositorio, así que no
    // puede elegir sucursal ni revelar si un id ajeno existe.
    if (
      requestedBranchId !== undefined &&
      requestedBranchId !== actor.branchId
    ) {
      throw new ForbiddenException(FORBIDDEN);
    }
    const items = await this.findItems(actor);
    return items.map((item) =>
      InventoryItemResponseDto.fromItem(
        item,
        // Se compara en Decimal para que el umbral no dependa de redondeos de float.
        item.currentStock.lessThanOrEqualTo(item.minimumStock),
      ),
    );
  }

  private async findItems(
    actor: InventoryActor,
  ): Promise<InventoryStockItem[]> {
    if (actor.role === 'GENERAL_MANAGER') {
      return this.repository.findInActiveBranches();
    }
    if (actor.role !== 'BRANCH_ADMIN' || !actor.branchId) {
      throw new ForbiddenException(FORBIDDEN);
    }
    try {
      return await this.repository.findByBranch(actor.branchId);
    } catch (error) {
      throw error instanceof BranchNotFoundError
        ? new NotFoundException(error.message)
        : error;
    }
  }
}
