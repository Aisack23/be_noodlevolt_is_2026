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
import { SalesReportQueryDto, SalesReportResponseDto } from '../dto/index.js';
import { SalesReportService } from '../services/index.js';

@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reports')
export class SalesReportController {
  constructor(
    @Inject(SalesReportService)
    private readonly service: SalesReportService,
  ) {}

  @Get('sales')
  @ApiOperation({
    summary: 'Reporte de ventas aprobadas por sucursal y rango',
    description:
      'Suma únicamente pagos PAID, excluye pedidos CANCELED, y respeta la zona horaria local de la sucursal para convertir el rango a UTC.',
  })
  @ApiQuery({
    name: 'from',
    required: true,
    type: String,
    example: '2026-01-15',
    description: 'Fecha inicial inclusiva con formato YYYY-MM-DD.',
  })
  @ApiQuery({
    name: 'to',
    required: true,
    type: String,
    example: '2026-01-16',
    description: 'Fecha final inclusiva con formato YYYY-MM-DD.',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: String,
    format: 'uuid',
    description:
      'Sucursal a consultar. BRANCH_ADMIN solo puede usar la propia. GENERAL_MANAGER puede dejarla vacía para consolidar todas.',
  })
  @ApiOkResponse({
    type: SalesReportResponseDto,
    description: 'Total consolidado para el rango consultado.',
    example: {
      from: '2026-01-15',
      to: '2026-01-16',
      branchId: '10000000-0000-4000-8000-000000000001',
      total: '123.45',
      paymentsCount: 2,
    },
  })
  @ApiBadRequestResponse({
    description:
      'Parámetros inválidos: fechas con formato incorrecto, rango invertido, mayor a 366 días o branchId no UUID.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'El parámetro from debe tener formato YYYY-MM-DD.',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Falta sesión válida.',
    example: {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Falta el token de acceso.',
    },
  })
  @ApiForbiddenResponse({
    description: 'Rol sin acceso o branchId ajeno a la sucursal del BRANCH_ADMIN.',
    example: {
      statusCode: 403,
      error: 'Forbidden',
      message: 'No tiene permiso para consultar otra sucursal.',
    },
  })
  @ApiNotFoundResponse({
    description: 'La sucursal especificada no existe.',
    example: {
      statusCode: 404,
      error: 'Not Found',
      message: 'La sucursal no existe.',
    },
  })
  getSales(
    @CurrentUser() user: User,
    @Query() query: SalesReportQueryDto,
  ): Promise<SalesReportResponseDto> {
    return this.service.getSales(user, query);
  }
}
