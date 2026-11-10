import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderRepository,
  type KitchenOrderRow,
} from '@AccountsOrders/repositories';
import {
  KitchenOrderIntegrityError,
  KitchenOrderNotFoundError,
  KitchenOrderTransitionError,
} from '@AccountsOrders/errors';
import type {
  KitchenOrderResponseDto,
  UpdateKitchenOrderStatusDto,
} from '../dto/index.js';

type KitchenActor = { id: string; role: string; branchId: string | null };

@Injectable()
export class KitchenService {
  constructor(
    @Inject(OrderRepository) private readonly orders: OrderRepository,
  ) {}

  async list(actor: KitchenActor): Promise<KitchenOrderResponseDto[]> {
    const branchId = this.requireCookBranch(actor);
    return (await this.orders.findKitchenQueue(branchId)).map(toResponse);
  }

  async listReady(actor: KitchenActor): Promise<KitchenOrderResponseDto[]> {
    const branchId = this.requireBranch(actor, 'WAITER');
    return (await this.orders.findReadyQueue(branchId)).map(toResponse);
  }

  async deliver(
    actor: KitchenActor,
    orderId: string,
  ): Promise<KitchenOrderResponseDto> {
    const branchId = this.requireBranch(actor, 'WAITER');
    return this.transition(actor, branchId, orderId, 'DELIVERED');
  }

  async updateStatus(
    actor: KitchenActor,
    orderId: string,
    input: UpdateKitchenOrderStatusDto,
  ): Promise<KitchenOrderResponseDto> {
    const branchId = this.requireCookBranch(actor);
    return this.transition(actor, branchId, orderId, input.status);
  }

  private async transition(
    actor: KitchenActor,
    branchId: string,
    orderId: string,
    nextStatus: 'IN_PREPARATION' | 'READY' | 'DELIVERED',
  ): Promise<KitchenOrderResponseDto> {
    try {
      return toResponse(
        await this.orders.transitionKitchenStatus(
          branchId,
          orderId,
          actor.id,
          nextStatus,
        ),
      );
    } catch (error) {
      if (error instanceof KitchenOrderNotFoundError)
        throw new NotFoundException(error.message);
      if (
        error instanceof KitchenOrderTransitionError ||
        error instanceof KitchenOrderIntegrityError
      )
        throw new ConflictException(error.message);
      throw error;
    }
  }

  private requireCookBranch(actor: KitchenActor): string {
    return this.requireBranch(actor, 'COOK');
  }

  private requireBranch(actor: KitchenActor, role: 'COOK' | 'WAITER'): string {
    if (actor.role !== role || !actor.branchId)
      throw new ForbiddenException(
        'El usuario no tiene permiso o no está asignado a una sucursal.',
      );
    return actor.branchId;
  }
}

function toResponse(order: KitchenOrderRow): KitchenOrderResponseDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    createdAt: order.createdAt,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.dishName,
      quantity: item.quantity,
      note: item.note,
      status: item.status,
    })),
  };
}
