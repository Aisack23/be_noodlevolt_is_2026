import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationAvailabilityRepository } from '../repositories/reservation-availability.repository.js';
import {
  ReservationBranchUnavailableError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import type { ReservationAvailabilityDto } from '../dto/reservation-availability.dto.js';

@Injectable()
export class ReservationAvailabilityService {
  constructor(
    @Inject(ReservationAvailabilityRepository)
    private readonly repository: ReservationAvailabilityRepository,
  ) {}
  async find(actor: { role: string }, input: ReservationAvailabilityDto) {
    if (actor.role !== 'CLIENT')
      throw new ForbiddenException(
        'Solo los clientes pueden consultar disponibilidad.',
      );
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(startsAt.getTime() + 90 * 60000);
    if (!Number.isFinite(endsAt.getTime()) || startsAt.getTime() <= Date.now())
      throw new BadRequestException(
        'La reservación debe ser para una fecha futura.',
      );
    try {
      return await this.repository.find(input, startsAt, endsAt);
    } catch (error) {
      if (error instanceof ReservationBranchUnavailableError)
        throw new NotFoundException(error.message);
      if (error instanceof ReservationUnavailableError)
        throw new ConflictException(error.message);
      throw error;
    }
  }
}
