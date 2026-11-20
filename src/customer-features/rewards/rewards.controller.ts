import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import {
  CreateRedemptionDto,
  RedemptionResponseDto,
  RedemptionsResponseDto,
  RewardResponseDto,
} from './reward.dto.js';
import { RewardsService } from './rewards.service.js';

@ApiTags('Recompensas de lealtad')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
@ApiForbiddenResponse({ description: 'Solo CLIENT.' })
@ApiBadRequestResponse({ description: 'UUID, paginación o cuerpo inválidos.' })
@Controller('loyalty')
export class RewardsController {
  constructor(
    @Inject(RewardsService) private readonly service: RewardsService,
  ) {}

  @Get('rewards')
  @ApiOperation({
    summary: 'Lista recompensas activas ordenadas por coste en puntos.',
  })
  @ApiOkResponse({ type: [RewardResponseDto] })
  catalog(@CurrentUser() actor: User) {
    return this.service.catalog(actor);
  }

  @Get('redemptions/me')
  @ApiOperation({ summary: 'Consulta el historial propio de canjes.' })
  @ApiOkResponse({ type: RedemptionsResponseDto })
  history(@CurrentUser() actor: User, @Query() query: PageQueryDto) {
    return this.service.history(actor, query);
  }

  @Post('redemptions')
  @ApiOperation({
    summary: 'Canjea puntos y aplica una recompensa al pedido propio.',
    description:
      'Una recompensa por pedido para llevar PENDING, sin pago aprobado. Producto disponible: añade una unidad gratuita para cocina. Descuento: se aplica al total y al siguiente cobro. Todo se confirma en una transacción. Reintentar la misma operación devuelve 200 sin descontar puntos nuevamente.',
  })
  @ApiCreatedResponse({ type: RedemptionResponseDto })
  @ApiOkResponse({
    type: RedemptionResponseDto,
    description: 'Reintento de la misma operación.',
  })
  @ApiNotFoundResponse({
    description: 'Pedido ajeno/inexistente o recompensa inactiva/inexistente.',
  })
  @ApiConflictResponse({
    description:
      'Saldo insuficiente, producto no disponible, sucursal cerrada, pedido no elegible o clave reutilizada con otro contenido.',
  })
  async redeem(
    @CurrentUser() actor: User,
    @Body() input: CreateRedemptionDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.redeem(actor, input);
    response.status(result.created ? 201 : 200);
    return result.redemption;
  }
}
