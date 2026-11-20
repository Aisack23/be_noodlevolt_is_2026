import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateReservationDto } from '../dto/create-reservation.dto.js';
import type { ReservationCancellationDto } from '../dto/branch-reservation.dto.js';
import type { ReservationResponseDto } from '../dto/reservation-response.dto.js';
import {
  ReservationBranchUnavailableError,
  ReservationDateInPastError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import { ReservationBookingRepository } from '../repositories/reservation-booking.repository.js';
import { ReservationRepository } from '../repositories/reservation.repository.js';
import type { User } from '@PrismaClient';

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
  async findByBranchAndDate(actor: StaffActor, branchId: string, date: string) {
    if (!internalStaffRoles.has(actor.role))
      throw new ForbiddenException('No tienes permisos para ver las reservaciones.');
    if (actor.role !== 'GENERAL_MANAGER' && actor.branchId?.toLowerCase() !== branchId.toLowerCase())
      throw new ForbiddenException('No tienes acceso a las reservaciones de esta sucursal.');

    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) ||
        parsed.toISOString().slice(0, 10) !== date || date.startsWith('0000-'))
      throw new BadRequestException('Utiliza una fecha válida en formato YYYY-MM-DD.');

    const results = await this.reservationRepository.listDaily(
      branchId, date, actor.role === 'GENERAL_MANAGER' || actor.role === 'BRANCH_ADMIN',
    );
    if (!results) throw new NotFoundException('La sucursal no existe.');
    return results;
  }

  async cancel(actor: StaffActor & { id: string }, id: string): Promise<ReservationCancellationDto> {
    if (actor.role !== 'GENERAL_MANAGER' && (actor.role !== 'BRANCH_ADMIN' || !actor.branchId))
      throw new ForbiddenException('No tienes permiso para cancelar reservaciones.');
    const result = await this.reservationRepository.cancel(
      id, actor.id, actor.role === 'GENERAL_MANAGER' ? undefined : actor.branchId!,
    );
    if (result === null) throw new NotFoundException('La reservación no existe.');
    if (result !== 'CANCELED') throw new ConflictException('La reservación ya no se puede cancelar.');
    return { id, status: 'CANCELED' };
  }
}
