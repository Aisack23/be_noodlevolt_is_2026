import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { TopDishesQueryDto, TopDishesResponseDto } from '../dto/index.js';
import { TopDishesService } from '../services/index.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reports')
export class TopDishesController {
  constructor(
    @Inject(TopDishesService)
    private readonly service: TopDishesService,
  ) {}

  @Get('top-dishes')
  @ApiOperation({
    summary: 'Platillos más vendidos por cantidad',
    description:
      'Suma la cantidad de ítems de pedidos no cancelados que tienen al menos un pago PAID dentro del rango local de cada sucursal.',
  })
  @ApiQuery({ name: 'from', required: true, type: String, example: '2026-01-15' })
  @ApiQuery({ name: 'to', required: true, type: String, example: '2026-01-16' })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: String,
    format: 'uuid',
    description:
      'Sucursal a consultar. BRANCH_ADMIN solo puede usar la propia. GENERAL_MANAGER puede omitirlo para consolidar todas.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Máximo de platillos devueltos. Por defecto 10 y máximo 100.',
  })
  @ApiOkResponse({
    type: TopDishesResponseDto,
    description: 'Platillos ordenados por cantidad vendida descendente.',
  })
  @ApiBadRequestResponse({ description: 'Fechas o límite inválidos.' })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Rol sin acceso o branchId ajeno a la sucursal del BRANCH_ADMIN.',
  })
  @ApiNotFoundResponse({ description: 'La sucursal especificada no existe.' })
  getTopDishes(
    @CurrentUser() user: User,
    @Query() query: TopDishesQueryDto,
  ): Promise<TopDishesResponseDto> {
    return this.service.getTopDishes(user, query);
  }
}

