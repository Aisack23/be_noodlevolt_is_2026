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
    return this.prisma
      .$transaction<ReservationResponseDto>(
        async (tx) => {
          const branches = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT id FROM branches WHERE id=${input.branchId}::uuid AND is_active=true FOR SHARE`);
          if (!branches.length) throw new ReservationBranchUnavailableError();
          const rejected: string[] = [];
          let table: { id: string } | undefined;
          while (!table) {
            const candidates = await tx.$queryRaw<
              { id: string; roomId: string | null }[]
            >(Prisma.sql`
            SELECT t.id, t.room_id AS "roomId" FROM tables t
            WHERE t.branch_id=${input.branchId}::uuid
              AND t.capacity>=${input.guests} AND t.status <> 'OUT_OF_SERVICE'
              ${input.tableId ? Prisma.sql`AND t.id=${input.tableId}::uuid` : Prisma.empty}
              ${rejected.length ? Prisma.sql`AND t.id NOT IN (${Prisma.join(rejected.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
              AND (t.room_id IS NULL OR EXISTS (
                SELECT 1 FROM dining_rooms r WHERE r.id=t.room_id AND r.branch_id=t.branch_id AND r.is_active=true))
              AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=t.id
                AND r.status IN ('PENDING','CONFIRMED')
                AND r.starts_at<${endsAt} AND r.ends_at>${startsAt})
            ORDER BY t.capacity,t.id LIMIT 1 FOR UPDATE OF t`);
            if (startsAt.getTime() <= Date.now())
              throw new ReservationDateInPastError();
            const candidate = candidates[0];
            if (!candidate)
              throw new ReservationUnavailableError(
                'No hay una mesa disponible en el intervalo solicitado.',
              );
            if (candidate.roomId) {
              const rooms = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
                SELECT id FROM dining_rooms WHERE id=${candidate.roomId}::uuid
                AND branch_id=${input.branchId}::uuid AND is_active=true FOR SHARE`);
              if (!rooms.length) {
                rejected.push(candidate.id);
                continue;
              }
            }
            if (
              await tx.reservation.findFirst({
                where: {
                  tableId: candidate.id,
                  status: { in: ['PENDING', 'CONFIRMED'] },
                  startsAt: { lt: endsAt },
                  endsAt: { gt: startsAt },
                },
                select: { id: true },
              })
            )
              rejected.push(candidate.id);
            else table = candidate;
          }
          if (startsAt.getTime() <= Date.now())
            throw new ReservationDateInPastError();
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
      )
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2004', 'P2010', 'P2039'].includes(error.code) &&
          JSON.stringify(error.meta ?? {}).includes(
            'reservations_no_active_overlap',
          )
        )
          throw new ReservationUnavailableError(
            'La mesa ya tiene una reservación en el intervalo solicitado.',
          );
        throw error;
      });
  }
}
