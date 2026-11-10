import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
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
import { InventoryItemResponseDto } from '../dto/index.js';
import { InventoryStockService } from '../services/index.js';

@ApiTags('Inventario')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryStockController {
  constructor(
    @Inject(InventoryStockService)
    private readonly service: InventoryStockService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Consulta las existencias de insumos y el stock bajo',
    description:
      'El GERENTE ve las existencias de su sucursal y el GERENTE_GENERAL, las de todas las sucursales activas. El rol y la sucursal se obtienen del usuario autenticado. Excluye insumos inactivos y ordena por sucursal, nombre e id. isLowStock es verdadero si currentStock es menor o igual que minimumStock.',
  })
  @ApiQuery({
    name: 'branchId',
    required: false,
    type: String,
    description:
      'No selecciona sucursal: si se envía y no coincide con la sucursal del usuario, responde 403. El GERENTE_GENERAL no tiene sucursal, así que siempre se rechaza.',
  })
  @ApiOkResponse({
    description:
      'Existencias visibles para el usuario. Una sucursal sin insumos responde con una lista vacía.',
    type: [InventoryItemResponseDto],
    example: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        branchId: '10000000-0000-4000-8000-000000000001',
        branchName: 'NoodleVolt Centro',
        name: 'Fideos de ramen',
        unit: 'kg',
        currentStock: 3,
        minimumStock: 5,
        isLowStock: true,
        updatedAt: '2026-11-05T18:00:00.000Z',
      },
    ],
  })
  @ApiUnauthorizedResponse({
    description: 'Falta el token de acceso o no es válido.',
    example: {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Falta el token de acceso.',
    },
  })
  @ApiForbiddenResponse({
    description:
      'El rol no puede consultar inventario o el branchId enviado no coincide con la sucursal del usuario. No se exponen existencias.',
    example: {
      statusCode: 403,
      error: 'Forbidden',
      message: 'No tiene permiso para consultar este inventario.',
    },
  })
  @ApiNotFoundResponse({
    description: 'La sucursal del gerente está inactiva.',
    example: {
      statusCode: 404,
      error: 'Not Found',
      message: 'La sucursal no existe.',
    },
  })
  getInventory(
    @CurrentUser() user: User,
    @Query('branchId') requestedBranchId?: unknown,
  ): Promise<InventoryItemResponseDto[]> {
    return this.service.getInventory(user, requestedBranchId);
  }
}
