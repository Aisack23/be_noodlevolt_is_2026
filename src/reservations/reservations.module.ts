import { Module } from '@nestjs/common';
import { ReservationRepository } from '@Reservations/repositories';

@Module({
  providers: [ReservationRepository],
  exports: [ReservationRepository],
})
export class ReservationsModule {}