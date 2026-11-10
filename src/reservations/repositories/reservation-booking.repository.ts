import { Inject, Injectable } from '@nestjs/common';
import {
  ReservationBranchUnavailableError,
  ReservationDateInPastError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import { PrismaService } from '@Prisma/services';
import { Prisma } from '@PrismaClient';
import type { CreateReservationDto } from '../dto/create-reservation.dto.js';
import type { ReservationResponseDto } from '../dto/reservation-response.dto.js';

@Injectable()
export class ReservationBookingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  book(
    customerId: string,
    input: CreateReservationDto,
    startsAt: Date,
    endsAt: Date,
  ): Promise<ReservationResponseDto> {
    return this.prisma.$transaction(
      async (tx) => {
        const branches = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM branches WHERE id=${input.branchId}::uuid AND is_active=true FOR SHARE`);
        if (!branches.length) throw new ReservationBranchUnavailableError();
        const tables = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM tables WHERE branch_id=${input.branchId}::uuid
        AND capacity>=${input.guests} AND status <> 'OUT_OF_SERVICE'
        ORDER BY capacity,id FOR UPDATE`);
        if (startsAt.getTime() <= Date.now())
          throw new ReservationDateInPastError();
        if (!tables.length)
          throw new ReservationUnavailableError(
            'No hay una mesa disponible con capacidad suficiente.',
          );
        const conflicts = await tx.reservation.findMany({
          where: {
            tableId: { in: tables.map((table) => table.id) },
            status: 'CONFIRMED',
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
          select: { tableId: true },
        });
        const occupied = new Set(conflicts.map((item) => item.tableId));
        const table = tables.find((item) => !occupied.has(item.id));
        if (!table)
          throw new ReservationUnavailableError(
            'No hay una mesa disponible en el intervalo solicitado.',
          );
        const reservation = await tx.reservation.create({
          data: {
            branchId: input.branchId,
            tableId: table.id,
            customerId,
            guests: input.guests,
            contactName: input.contactName.trim(),
            phone: input.phone,
            startsAt,
            endsAt,
            status: 'CONFIRMED',
          },
          select: {
            id: true,
            branchId: true,
            tableId: true,
            guests: true,
            startsAt: true,
            endsAt: true,
          },
        });
        return {
          ...reservation,
          startsAt: reservation.startsAt.toISOString(),
          endsAt: reservation.endsAt.toISOString(),
          status: 'CONFIRMED',
        };
      },
      { timeout: 10000, isolationLevel: 'ReadCommitted' },
    );
  }
}
