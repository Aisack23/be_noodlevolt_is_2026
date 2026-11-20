
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  Prisma,
  type Reservation,
  type ReservationStatus,
} from '@PrismaClient';

export interface CreateReservationData {
  branchId: string;
  tableId: string;
  customerId?: string | null;
  contactName: string;
  phone: string;
  guests: number;
  startsAt: Date;
  endsAt: Date;
  status?: ReservationStatus;
}

export interface UpdateReservationData {
  tableId?: string;
  customerId?: string | null;
  contactName?: string;
  phone?: string;
  guests?: number;
  startsAt?: Date;
  endsAt?: Date;
}

@Injectable()
export class ReservationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateReservationData): Promise<Reservation> {
    return this.prisma.reservation.create({
      data,
    });
  }

  findById(id: string): Promise<Reservation | null> {
    return this.prisma.reservation.findUnique({
      where: { id },
    });
  }

  findByBranch(branchId: string): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: { branchId },
      orderBy: { startsAt: 'asc' },
    });
  }

  findByTable(tableId: string): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: { tableId },
      orderBy: { startsAt: 'asc' },
    });
  }

  findByCustomer(customerId: string): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: { customerId },
      orderBy: { startsAt: 'desc' },
    });
  }

  async listDaily(branchId: string, date: string, administrative: boolean) {
    const [window] = await this.prisma.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
      SELECT
        (${date}::date::timestamp AT TIME ZONE time_zone) AS start,
        ((${date}::date + 1)::timestamp AT TIME ZONE time_zone) AS "end"
      FROM branches WHERE id = ${branchId}::uuid
    `);
    if (!window) return null;

    const where = {
      branchId,
      startsAt: { lt: window.end },
      endsAt: { gt: window.start },
      ...(!administrative ? { status: { in: ['PENDING', 'CONFIRMED'] as ReservationStatus[] } } : {}),
    };
    const schedule = {
      table: { select: { number: true } },
      guests: true,
      startsAt: true,
      endsAt: true,
    } as const;
    const orderBy = [{ startsAt: 'asc' }, { id: 'asc' }] satisfies Prisma.ReservationOrderByWithRelationInput[];
    const alias = (index: number) => `Reserva ${index + 1}`;

    if (administrative) {
      const entries = await this.prisma.reservation.findMany({
        where,
        orderBy,
        select: { ...schedule, status: true, id: true, tableId: true, contactName: true, phone: true },
      });
      return entries.map(({ table, ...entry }, index) => ({
        ...entry, alias: alias(index), tableNumber: table.number,
      }));
    }

    const entries = await this.prisma.reservation.findMany({ where, orderBy, select: schedule });
    return entries.map(({ table, ...entry }, index) => ({
      ...entry, alias: alias(index), tableNumber: table.number,
    }));
  }

  async cancel(id: string, userId: string, branchId?: string) {
    const scope = { id, ...(branchId ? { branchId } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.reservation.updateMany({
        where: { ...scope, status: { in: ['PENDING', 'CONFIRMED'] } },
        data: { status: 'CANCELED', canceledAt: new Date(), canceledById: userId },
      });
      if (result.count) return 'CANCELED';
      const existing = await tx.reservation.findFirst({ where: scope, select: { status: true } });
      return existing?.status ?? null;
    });
  }

  findByDateRange(
    branchId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: {
        branchId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  findByTableAndDateRange(
    tableId: string,
    startsAt: Date,
    endsAt: Date,
  ): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: {
        tableId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  findByStatus(status: ReservationStatus): Promise<Reservation[]> {
    return this.prisma.reservation.findMany({
      where: { status },
      orderBy: { startsAt: 'asc' },
    });
  }

  update(
    id: string,
    data: UpdateReservationData,
  ): Promise<Reservation> {
    return this.prisma.reservation.update({
      where: { id },
      data,
    });
  }

  updateStatus(
    id: string,
    status: ReservationStatus,
  ): Promise<Reservation> {
    return this.prisma.reservation.update({
      where: { id },
      data: { status },
    });
  }
}
