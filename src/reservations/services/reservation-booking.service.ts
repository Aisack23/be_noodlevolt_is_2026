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
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type { Reservation, User } from '@PrismaClient';

type StaffActor = Pick<User, 'role' | 'branchId'>;
const internalStaffRoles = new Set<string>([
  'WAITER',
  'COOK',
  'CASHIER',
  'BRANCH_ADMIN',
  'GENERAL_MANAGER',
]);

@Injectable()
export class ReservationBookingService {
  constructor(
    @Inject(ReservationBookingRepository)
    private readonly repository: ReservationBookingRepository,
    @Inject(ReservationRepository)
    private readonly reservationRepository: ReservationRepository,
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
  async findByBranch(actor: StaffActor, branchId: string): Promise<Reservation[]> {
    const isStaff = internalStaffRoles.has(actor.role);

    if (isStaff) {
      if (
        actor.role !== 'GENERAL_MANAGER' &&
        actor.branchId?.toLowerCase() !== branchId.toLowerCase()
      ) {
        throw new ForbiddenException(
          'Se requiere personal autorizado de la sucursal.',
        );
      }
    } else {
      throw new ForbiddenException('No tienes permisos para ver las reservaciones de esta sucursal.');
    }
    return this.reservationRepository.findByBranch(branchId);
  }

  async findByBranchAndDate(
    actor: { id: string; role: string; branchId?: string | null },
    branchId: string,
    dateQuery: string, 
  ): Promise<Reservation[]> {

    if (!internalStaffRoles.has(actor.role)) {
      throw new ForbiddenException('No tienes permisos para ver las reservaciones.');
    }

    if (
      actor.role !== 'GENERAL_MANAGER' &&
      actor.branchId?.toLowerCase() !== branchId.toLowerCase()
    ) {
      throw new ForbiddenException('No tienes acceso a las reservaciones de esta sucursal.');
    }

    const startsAt = new Date(`${dateQuery}T00:00:00-06:00`);
    const endsAt = new Date(`${dateQuery}T23:59:59-06:00`);

    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
      throw new BadRequestException('El formato de la fecha es inválido. Utiliza YYYY-MM-DD.');
    }

    return this.reservationRepository.findByDateRange(branchId, startsAt, endsAt);
  }
}