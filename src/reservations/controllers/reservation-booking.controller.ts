import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiExtraModels,
  getSchemaPath,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  AdministrativeReservationDto, OperationalReservationDto, ReservationCancellationDto,
} from '../dto/branch-reservation.dto.js';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { CreateReservationDto } from '../dto/create-reservation.dto.js';
import { ReservationResponseDto } from '../dto/reservation-response.dto.js';
import { ReservationBookingService } from '../services/reservation-booking.service.js';

@ApiTags('reservations')
@ApiExtraModels(AdministrativeReservationDto, OperationalReservationDto)
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
      'CLIENT. tableId opcional selecciona una mesa de la sucursal. Si se omite, asignación automática por menor capacidad suficiente e ID. Intervalo de 90 minutos; PENDING y CONFIRMED bloquean. El propietario proviene de la sesión.',
  })
  @ApiCreatedResponse({ type: ReservationResponseDto })
  @ApiBadRequestResponse({
    description: 'Fecha pasada, fecha sin zona horaria o datos inválidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Sesión ausente o inválida.' })
  @ApiForbiddenResponse({ description: 'Se requiere rol CLIENT.' })
  @ApiNotFoundResponse({ description: 'Sucursal inexistente o inactiva.' })
  @ApiConflictResponse({
    description:
      'Sin mesa elegible, mesa de otra sucursal, salón inactivo o intervalo sin disponibilidad.',
  })
  book(
    @CurrentUser() user: User,
    @Body() input: CreateReservationDto,
  ): Promise<ReservationResponseDto> {
    return this.service.book(user, input);
  }

  @Get('branches/:branchId/reservations')
  @ApiOperation({
    summary:
      'Lista las reservaciones de una sucursal para una fecha específica.',
  })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Fecha en formato YYYY-MM-DD',
    example: '2026-11-16',
  })
  @ApiOkResponse({ schema: { oneOf: [
    { type: 'array', items: { $ref: getSchemaPath(AdministrativeReservationDto) } },
    { type: 'array', items: { $ref: getSchemaPath(OperationalReservationDto) } },
  ] } })
  @ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere personal autorizado de la sucursal.',
  })
  findBranchReservations(
    @CurrentUser() actor: User,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Query('date') date: string,
  ) {
    if (!date) {
      throw new BadRequestException(
        'El parámetro de consulta "date" es obligatorio.',
      );
    }
    return this.service.findByBranchAndDate(actor, branchId, date);
  }

  @Patch(':id/cancel')
  @ApiOkResponse({ type: ReservationCancellationDto })
  @ApiForbiddenResponse({ description: 'Se requiere gerencia autorizada.' })
  @ApiNotFoundResponse({ description: 'Reserva inexistente o fuera de alcance.' })
  @ApiConflictResponse({ description: 'Estado incompatible con cancelación.' })
  cancel(@CurrentUser() actor: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.cancel(actor, id);
  }
}
