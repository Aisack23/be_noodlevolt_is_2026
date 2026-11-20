import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import {
  ReservationBranchUnavailableError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import type { ReservationAvailabilityDto } from '../dto/reservation-availability.dto.js';

@Injectable()
export class ReservationAvailabilityRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async find(input: ReservationAvailabilityDto, startsAt: Date, endsAt: Date) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: input.branchId, isActive: true },
      select: { id: true },
    });
    if (!branch) throw new ReservationBranchUnavailableError();
    if (
      input.roomId &&
      !(await this.prisma.diningRoom.findFirst({
        where: { id: input.roomId, branchId: input.branchId, isActive: true },
        select: { id: true },
      }))
    )
      throw new ReservationUnavailableError(
        'El salón no está disponible en la sucursal.',
      );
    return this.prisma.diningTable.findMany({
      where: {
        branchId: input.branchId,
        roomId: input.roomId,
        capacity: { gte: input.guests },
        status: { not: 'OUT_OF_SERVICE' },
        OR: [{ roomId: null }, { room: { isActive: true } }],
        reservations: {
          none: {
            status: { in: ['PENDING', 'CONFIRMED'] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        },
      },
      orderBy: [{ capacity: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        branchId: true,
        roomId: true,
        number: true,
        capacity: true,
      },
    });
  }
}
