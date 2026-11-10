import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import {
  ReservationBranchUnavailableError,
  ReservationDateInPastError,
  ReservationUnavailableError,
} from '../errors/reservation-booking.errors.js';
import { ReservationBookingRepository } from '../repositories/reservation-booking.repository.js';
import { ReservationBookingService } from './reservation-booking.service.js';

const customer = { id: '10000000-0000-4000-8000-000000000001', role: 'CLIENT' };
const input = () => ({
  branchId: '20000000-0000-4000-8000-000000000001',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  guests: 4,
  contactName: 'Isaac',
  phone: '+50370000000',
});

describe('ReservationBookingService: traducción de errores de dominio', () => {
  const repository = { book: vi.fn() };
  const service = new ReservationBookingService(
    repository as unknown as ReservationBookingRepository,
  );
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    [new ReservationBranchUnavailableError(), NotFoundException],
    [new ReservationDateInPastError(), BadRequestException],
    [
      new ReservationUnavailableError('Sin mesa disponible.'),
      ConflictException,
    ],
  ])('traduce %s a su excepción HTTP', async (domainError, httpError) => {
    repository.book.mockRejectedValue(domainError);
    await expect(service.book(customer, input())).rejects.toBeInstanceOf(
      httpError,
    );
  });

  it('propaga errores inesperados sin convertirlos en un conflicto de negocio', async () => {
    const failure = new Error('Database unavailable');
    repository.book.mockRejectedValue(failure);
    await expect(service.book(customer, input())).rejects.toBe(failure);
  });
});
