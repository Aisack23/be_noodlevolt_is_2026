import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateReservationDto } from '../dto/create-reservation.dto.js';
import type { ReservationResponseDto } from '../dto/reservation-response.dto.js';
import {
  ReservationBranchUnavailableError,
  ReservationDateInPastError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import { ReservationBookingRepository } from '../repositories/reservation-booking.repository.js';

@Injectable()
export class ReservationBookingService {
  constructor(
    @Inject(ReservationBookingRepository)
    private readonly repository: ReservationBookingRepository,
  ) {}

  async book(
    customer: { id: string; role: string },
    input: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    if (customer.role !== 'CLIENT')
      throw new ForbiddenException('Solo los clientes pueden reservar mesas.');
    const startsAt = new Date(input.startsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'La reservación debe ser para una fecha futura.',
      );
    }
    const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);
    if (!Number.isFinite(endsAt.getTime()))
      throw new BadRequestException(
        'El intervalo de la reservación no es válido.',
      );
    try {
      return await this.repository.book(customer.id, input, startsAt, endsAt);
    } catch (error) {
      if (error instanceof ReservationBranchUnavailableError)
        throw new NotFoundException(error.message);
      if (error instanceof ReservationDateInPastError)
        throw new BadRequestException(error.message);
      if (error instanceof ReservationUnavailableError)
        throw new ConflictException(error.message);
      throw error;
    }
  }
}
