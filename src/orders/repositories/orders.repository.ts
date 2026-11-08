import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { CreateOrderDto } from '../dto/create-order.dto.js';
import type { OrderResponseDto } from '../dto/order-response.dto.js';

const orderSelect = {
  id: true,
  branchId: true,
  customerId: true,
  operationId: true,
  requestHash: true,
  status: true,
  total: true,
  items: {
    select: { dishId: true, dishName: true, quantity: true, unitPrice: true },
    orderBy: { dishId: 'asc' },
  },
} as const satisfies Prisma.OrderSelect;

type StoredOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

@Injectable()
export class OrdersRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(
    customerId: string,
    input: CreateOrderDto,
    requestHash: string,
  ): Promise<{ created: boolean; order: OrderResponseDto }> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.operationKey}, 0))::text`,
        );
        const existing = await tx.order.findUnique({
          where: { operationId: input.operationKey },
          select: orderSelect,
        });
        if (existing) {
          if (
            existing.customerId !== customerId ||
            existing.requestHash !== requestHash
          )
            throw new ConflictException(
              'La clave de operación ya se utilizó con otro contenido.',
            );
          return { created: false, order: toResponse(existing) };
        }
        await this.requireOpenBranch(tx, input.branchId);
        const lines = await this.priceLines(tx, input);
        const total = lines.reduce(
          (sum, line) => sum.add(line.unitPrice.mul(line.quantity)),
          new Prisma.Decimal(0),
        );
        const order = await tx.order.create({
          data: {
            branchId: input.branchId,
            customerId,
            operationId: input.operationKey,
            requestHash,
            total,
            type: 'TAKEOUT',
            paymentMode: 'ONLINE',
            status: 'PENDING',
            items: { create: lines },
          },
          select: orderSelect,
        });
        return { created: true, order: toResponse(order) };
      },
      { timeout: 10000 },
    );
  }

  private async requireOpenBranch(
    tx: Prisma.TransactionClient,
    branchId: string,
  ): Promise<void> {
    const branches = await tx.$queryRaw<{ isActive: boolean }[]>(Prisma.sql`
      SELECT is_active AS "isActive" FROM branches WHERE id=${branchId}::uuid FOR SHARE`);
    if (!branches.length) throw new NotFoundException('La sucursal no existe.');
    if (!branches[0].isActive)
      throw new ConflictException('La sucursal no está activa.');
    const configs = await tx.$queryRaw<{ isOpen: boolean }[]>(Prisma.sql`
      SELECT is_open AS "isOpen" FROM branch_configs WHERE branch_id=${branchId}::uuid FOR SHARE`);
    if (!configs[0]?.isOpen)
      throw new ConflictException('La sucursal no acepta pedidos.');
  }

  private async priceLines(
    tx: Prisma.TransactionClient,
    input: CreateOrderDto,
  ) {
    const dishIds = input.lines.map((line) => Prisma.sql`${line.dishId}::uuid`);
    const dishes = await tx.$queryRaw<
      { id: string; name: string; price: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT d.id, d.name, d.price FROM dishes d
      JOIN categories c ON c.id=d.category_id AND c.branch_id=d.branch_id
      WHERE d.branch_id=${input.branchId}::uuid AND d.id IN (${Prisma.join(dishIds)})
        AND d.is_available=true AND d.is_deleted=false AND d.status='AVAILABLE' AND c.is_active=true
      ORDER BY d.id FOR SHARE OF d, c`);
    if (dishes.length !== input.lines.length)
      throw new ConflictException(
        'Hay platillos no disponibles para esta sucursal.',
      );
    const byId = new Map(dishes.map((dish) => [dish.id, dish]));
    return input.lines.map((line) => {
      const dish = byId.get(line.dishId)!;
      return {
        dishId: dish.id,
        dishName: dish.name,
        quantity: line.quantity,
        unitPrice: new Prisma.Decimal(dish.price.toString()),
      };
    });
  }
}

function toResponse(order: StoredOrder): OrderResponseDto {
  if (order.total === null)
    throw new ConflictException(
      'El pedido pertenece a otro contrato de creación.',
    );
  return {
    id: order.id,
    branchId: order.branchId,
    operationKey: order.operationId,
    status: order.status,
    total: order.total.toFixed(2),
    lines: order.items.map((item) => ({
      dishId: item.dishId,
      name: item.dishName,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.unitPrice.mul(item.quantity).toFixed(2),
    })),
  };
}
