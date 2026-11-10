import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { CreateReservationDto } from '../dto/create-reservation.dto.js';
import { ReservationBookingRepository } from '../repositories/reservation-booking.repository.js';

@Injectable()
export class ReservationBookingService {
  constructor(
    @Inject(ReservationBookingRepository)
    private readonly repository: ReservationBookingRepository,
  ) {}

  book(customer: { id: string; role: string }, input: CreateReservationDto) {
    if (customer.role !== 'CLIENT')
      throw new ForbiddenException('Solo los clientes pueden reservar mesas.');
    const startsAt = new Date(input.startsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    )
      throw new BadRequestException(
        'La reservación debe ser para una fecha futura.',
      );
    const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
    return this.repository.book(customer.id, input, startsAt, endsAt);
  }
}
