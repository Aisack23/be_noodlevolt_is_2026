import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { CreateReservationDto } from '../dto/create-reservation.dto.js';
import { ReservationResponseDto } from '../dto/reservation-response.dto.js';
import { ReservationBookingService } from '../services/reservation-booking.service.js';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationBookingController {
  constructor(
    @Inject(ReservationBookingService)
    private readonly service: ReservationBookingService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Reserva una mesa disponible durante 90 minutos.',
    description:
      'CLIENT. La mesa se asigna automáticamente por menor capacidad suficiente e ID. El propietario proviene de la sesión.',
  })
  @ApiCreatedResponse({ type: ReservationResponseDto })
  @ApiBadRequestResponse({
    description: 'Fecha pasada, fecha sin zona horaria o datos inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión ausente o inválida.' })
  @ApiForbiddenResponse({ description: 'Se requiere rol CLIENT.' })
  @ApiNotFoundResponse({ description: 'Sucursal inexistente o inactiva.' })
  @ApiConflictResponse({
    description: 'Sin mesa elegible o intervalo sin disponibilidad.',
  })
  book(
    @CurrentUser() user: User,
    @Body() input: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    return this.service.book(user, input);
  }
}
