
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
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
