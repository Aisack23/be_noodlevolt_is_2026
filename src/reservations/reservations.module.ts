import { ReservationBookingController } from './controllers/reservation-booking.controller.js';
import { ReservationBookingService } from './services/reservation-booking.service.js';
import { ReservationBookingRepository } from './repositories/reservation-booking.repository.js';
import { Module } from '@nestjs/common';
import { ReservationRepository } from '@Reservations/repositories';

@Module({
  controllers: [ReservationBookingController],
  providers: [
    ReservationRepository,
    ReservationBookingService,
    ReservationBookingRepository,
  ],
  exports: [ReservationRepository],
})
export class ReservationsModule {}
