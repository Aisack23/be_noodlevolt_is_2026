import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { DiningTablesQueryDto } from '../dto/dining-query.dto.js';
import {
  DiningRoomsResponseDto,
  DiningTablesResponseDto,
  DiningTableResponseDto,
} from '../dto/dining-response.dto.js';
import { DiningQueryService } from '../services/dining-query.service.js';

@ApiTags('Mesas y salones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
@ApiForbiddenResponse({
  description:
    'Personal autorizado de su sucursal; GENERAL_MANAGER puede consultar otras sucursales.',
})
@ApiBadRequestResponse({ description: 'UUID, paginación o filtros inválidos.' })
@ApiNotFoundResponse({
  description: 'Sucursal inactiva o recurso inexistente en la sucursal.',
})
@Controller('branches/:branchId')
export class DiningQueryController {
  constructor(
    @Inject(DiningQueryService) private readonly service: DiningQueryService,
  ) {}

  @Get('rooms')
  @ApiOperation({ summary: 'Lista salones y cantidad de mesas por sucursal.' })
  @ApiOkResponse({ type: DiningRoomsResponseDto })
  rooms(
    @CurrentUser() actor: User,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.service.rooms(actor, branchId, query);
  }

  @Get('tables')
  @ApiOperation({
    summary:
      'Lista mesas por sucursal, con filtros opcionales de salón y estado.',
    description:
      'Estado físico actual, no disponibilidad futura para reservaciones. Incluye mesas sin salón con roomId y room nulos.',
  })
  @ApiOkResponse({ type: DiningTablesResponseDto })
  tables(
    @CurrentUser() actor: User,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Query() query: DiningTablesQueryDto,
  ) {
    return this.service.tables(actor, branchId, query);
  }

  @Get('tables/:id')
  @ApiOperation({
    summary: 'Consulta una mesa y su salón dentro de la sucursal.',
  })
  @ApiOkResponse({ type: DiningTableResponseDto })
  table(
    @CurrentUser() actor: User,
    @Param('branchId', new ParseUUIDPipe()) branchId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.table(actor, branchId, id);
  }
}
