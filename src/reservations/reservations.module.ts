import { ReservationAvailabilityRepository } from './repositories/reservation-availability.repository.js';
import { ReservationAvailabilityService } from './services/reservation-availability.service.js';
import { ReservationAvailabilityController } from './controllers/reservation-availability.controller.js';
import { ReservationBookingController } from './controllers/reservation-booking.controller.js';
import { ReservationBookingService } from './services/reservation-booking.service.js';
import { ReservationBookingRepository } from './repositories/reservation-booking.repository.js';
import { Module } from '@nestjs/common';
import { ReservationRepository } from '@Reservations/repositories';

@Module({
  controllers: [
    ReservationBookingController,
    ReservationAvailabilityController,
  ],
  providers: [
    ReservationAvailabilityService,
    ReservationAvailabilityRepository,
    ReservationRepository,
    ReservationBookingService,
    ReservationBookingRepository,
  ],
  exports: [ReservationRepository],
})
export class ReservationsModule {}
