import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  AvailableReservationTableDto,
  ReservationAvailabilityDto,
} from '../dto/reservation-availability.dto.js';
import { ReservationAvailabilityService } from '../services/reservation-availability.service.js';

@ApiTags('reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationAvailabilityController {
  constructor(
    @Inject(ReservationAvailabilityService)
    private readonly service: ReservationAvailabilityService,
  ) {}
  @Get('availability')
  @ApiOperation({
    summary: 'Mesas disponibles para un intervalo de 90 minutos.',
    description:
      'CLIENT. startsAt futuro con offset; intervalo [startsAt, startsAt + 90 minutos). Filtra sucursal, capacidad y salón opcional. PENDING y CONFIRMED bloquean. Consulta orientativa; POST vuelve a comprobar dentro de la transacción. Orden por capacidad e ID; sin datos personales.',
  })
  @ApiOkResponse({ type: [AvailableReservationTableDto] })
  @ApiBadRequestResponse({
    description: 'Fecha, offset, capacidad o campos inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión ausente o inválida.' })
  @ApiForbiddenResponse({ description: 'Se requiere CLIENT.' })
  @ApiNotFoundResponse({ description: 'Sucursal inexistente o inactiva.' })
  @ApiConflictResponse({
    description: 'Salón inexistente, inactivo o de otra sucursal.',
  })
  find(@CurrentUser() actor: User, @Query() query: ReservationAvailabilityDto) {
    return this.service.find(actor, query);
  }
}
