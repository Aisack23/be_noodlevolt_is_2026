import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { CreateOrderDto } from '../dto/create-order.dto.js';
import type { CreateSalonOrderDto } from '../dto/create-salon-order.dto.js';
import type { OrderResponseDto } from '../dto/order-response.dto.js';
import { SalonOrderResponseDto } from '../dto/salon-order-response.dto.js';
import { assertExpectedPrice } from '../services/order-pricing.js';
import {
  hasDuplicateSalonLines,
  normalizeSalonOrder,
  salonOrderRequestHash,
} from '../services/order-request.js';

const PICKUP_ESTIMATE_MS = 20 * 60 * 1000;

const orderSelect = {
  id: true,
  branchId: true,
  customerId: true,
  operationId: true,
  orderNumber: true,
  requestHash: true,
  status: true,
  total: true,
  loyaltyDiscount: true,
  loyaltyRedemptionId: true,
  paymentMode: true,
  pickupAt: true,
  items: {
    select: { dishId: true, dishName: true, quantity: true, unitPrice: true },
    orderBy: { dishId: 'asc' },
  },
} as const satisfies Prisma.OrderSelect;

const salonOrderSelect = {
  id: true,
  branchId: true,
  accountId: true,
  waiterId: true,
  orderNumber: true,
  status: true,
  type: true,
  total: true,
  createdAt: true,
  requestHash: true,
  operationId: true,
  account: {
    select: {
      tableId: true,
      table: { select: { number: true } },
    },
  },
  items: {
    select: {
      dishId: true,
      dishName: true,
      quantity: true,
      unitPrice: true,
      note: true,
    },
    orderBy: { dishId: 'asc' },
  },
} as const satisfies Prisma.OrderSelect;

type StoredOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;
type StoredSalonOrder = Prisma.OrderGetPayload<{ select: typeof salonOrderSelect }>;

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
            paymentMode: input.paymentMode ?? 'ONLINE',
            pickupAt: new Date(Date.now() + PICKUP_ESTIMATE_MS),
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

  async createSalon(
    waiterId: string,
    branchId: string,
    input: CreateSalonOrderDto,
  ): Promise<{ created: boolean; order: SalonOrderResponseDto }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.operationKey}, 0))::text`,
      );
      const normalized = normalizeSalonOrder(input);
      if (hasDuplicateSalonLines(normalized.lines)) {
        throw new BadRequestException(
          'Hay líneas duplicadas para el mismo platillo y nota; suma cantidades.',
        );
      }
      const requestHash = salonOrderRequestHash(waiterId, normalized);
      const existing = await tx.order.findUnique({
        where: { operationId: input.operationKey },
        select: salonOrderSelect,
      });
      if (existing) {
        if (
          existing.waiterId !== waiterId ||
          existing.requestHash !== requestHash ||
          existing.branchId !== branchId
        )
          throw new ConflictException(
            'La clave de operación ya se utilizó con otro contenido.',
          );
        return { created: false, order: toSalonResponse(existing) };
      }

      const lockedTable = await tx.$queryRaw<
        { id: string; number: string; status: string; room_is_active: boolean | null }[]
      >(Prisma.sql`
        SELECT t.id, t.number, t.status, (
          SELECT r.is_active
          FROM dining_rooms r
          WHERE r.id = t.room_id AND r.branch_id = t.branch_id
        ) AS "room_is_active"
        FROM tables t
        WHERE t.id=${input.tableId}::uuid AND t.branch_id=${branchId}::uuid
        FOR UPDATE OF t`);

      if (!lockedTable[0])
        throw new NotFoundException(
          'La mesa no existe o no está en esta sucursal.',
        );
      if (lockedTable[0].status === 'OUT_OF_SERVICE')
        throw new ConflictException('La mesa está fuera de servicio.');
      if (lockedTable[0].room_is_active === false)
        throw new ConflictException('El salón está inactivo.');

      await this.requireOpenBranch(tx, branchId);

      const openAccount = await tx.account.findFirst({
        where: { branchId, tableId: input.tableId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
        select: { id: true },
      });
      const account =
        openAccount ??
        (await tx.account.create({
          data: { branchId, tableId: input.tableId, status: 'OPEN' },
          select: { id: true },
        }));

      const lines = await this.priceSalonLines(tx, branchId, normalized.lines);
      const total = lines.reduce(
        (sum, line) => sum.add(line.unitPrice.mul(line.quantity)),
        new Prisma.Decimal(0),
      );

      const order = await tx.order.create({
        data: {
          branchId,
          accountId: account.id,
          waiterId,
          operationId: input.operationKey,
          requestHash,
          total,
          type: 'DINE_IN',
          status: 'PENDING',
          items: {
            create: lines.map((line) => ({
              dishId: line.dishId,
              dishName: line.dishName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              note: line.note,
            })),
          },
        },
        select: salonOrderSelect,
      });
      return { created: true, order: toSalonResponse(order) };
    }, { timeout: 10000 });
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
      assertExpectedPrice(line.expectedPrice, dish.price.toFixed(2), dish.id);
      return {
        dishId: dish.id,
        dishName: dish.name,
        quantity: line.quantity,
        unitPrice: new Prisma.Decimal(dish.price.toString()),
      };
    });
  }

  private async priceSalonLines(
    tx: Prisma.TransactionClient,
    branchId: string,
    lines: { dishId: string; quantity: number; note: string | null }[],
  ) {
    const dishIds = lines.map((line) => Prisma.sql`${line.dishId}::uuid`);
    const dishes = await tx.$queryRaw<
      { id: string; name: string; price: Prisma.Decimal }[]
    >(Prisma.sql`
      SELECT d.id, d.name, d.price FROM dishes d
      JOIN categories c ON c.id=d.category_id AND c.branch_id=d.branch_id
      WHERE d.branch_id=${branchId}::uuid AND d.id IN (${Prisma.join(dishIds)})
        AND d.is_available=true AND d.is_deleted=false AND d.status='AVAILABLE' AND c.is_active=true
      ORDER BY d.id FOR SHARE OF d, c`);
    const byId = new Map(dishes.map((dish) => [dish.id, dish]));
    const missing = lines.find((line) => !byId.has(line.dishId));
    if (missing) {
      throw new ConflictException({
        message: 'Hay platillos no disponibles para esta sucursal.',
        dishId: missing.dishId,
      });
    }
    return lines.map((line) => {
      const dish = byId.get(line.dishId)!;
      return {
        dishId: dish.id,
        dishName: dish.name,
        quantity: line.quantity,
        unitPrice: new Prisma.Decimal(dish.price.toString()),
        note: line.note,
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
    orderNumber: order.orderNumber,
    branchId: order.branchId,
    operationKey: order.operationId,
    status: order.status,
    total: order.total.toFixed(2),
    discount: order.loyaltyDiscount.toFixed(2),
    loyaltyRedemptionId: order.loyaltyRedemptionId,
    paymentMode: order.paymentMode,
    pickupAt: order.pickupAt?.toISOString() ?? null,
    lines: order.items.map((item) => ({
      dishId: item.dishId,
      name: item.dishName,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      subtotal: item.unitPrice.mul(item.quantity).toFixed(2),
    })),
  };
}

function toSalonResponse(order: StoredSalonOrder): SalonOrderResponseDto {
  if (order.total === null)
    throw new ConflictException('El pedido no tiene total calculado.');
  const tableId = order.account?.tableId ?? '';
  const tableNumber = order.account?.table?.number ?? '';
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    type: order.type as 'DINE_IN',
    total: order.total.toFixed(2),
    tableId,
    tableNumber,
    waiterId: order.waiterId ?? '',
    createdAt: order.createdAt.toISOString(),
    lines: order.items.map((item) => ({
      dishId: item.dishId,
      dishName: item.dishName,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      note: item.note,
    })),
  };
}