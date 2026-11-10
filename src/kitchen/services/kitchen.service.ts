import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KitchenOrderTransitionError,
  OrderRepository,
  type KitchenOrderRow,
} from '@AccountsOrders/repositories';
import { UserRole, type User } from '@PrismaClient';
import type {
  KitchenOrderResponseDto,
  UpdateKitchenOrderStatusDto,
} from '../dto/index.js';

type KitchenActor = Pick<User, 'id' | 'role' | 'branchId'>;

@Injectable()
export class KitchenService {
  constructor(
    @Inject(OrderRepository) private readonly orders: OrderRepository,
  ) {}

  async list(actor: KitchenActor): Promise<KitchenOrderResponseDto[]> {
    const branchId = this.requireCookBranch(actor);
    return (await this.orders.findKitchenQueue(branchId)).map(toResponse);
  }

  async updateStatus(
    actor: KitchenActor,
    orderId: string,
    input: UpdateKitchenOrderStatusDto,
  ): Promise<KitchenOrderResponseDto> {
    const branchId = this.requireCookBranch(actor);
    try {
      const order = await this.orders.transitionKitchenStatus(
        branchId,
        orderId,
        actor.id,
        input.status,
      );
      if (!order)
        throw new NotFoundException('El pedido no existe en esta sucursal.');
      return toResponse(order);
    } catch (error) {
      if (error instanceof KitchenOrderTransitionError)
        throw new ConflictException(error.message);
      throw error;
    }
  }

  private requireCookBranch(actor: KitchenActor): string {
    if (actor.role !== UserRole.COOK || !actor.branchId)
      throw new ForbiddenException(
        'Solo el personal de cocina asignado a una sucursal puede gestionar pedidos.',
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
