import { Body, Controller, Inject, Post, Res } from '@nestjs/common';
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
import type { Response } from 'express';
import type { User } from '@PrismaClient';
import { CurrentUser } from '@Auth/decorators';
import { CreateOrderDto } from '../dto/create-order.dto.js';
import { CreateSalonOrderDto } from '../dto/create-salon-order.dto.js';
import { OrderResponseDto } from '../dto/order-response.dto.js';
import { SalonOrderResponseDto } from '../dto/salon-order-response.dto.js';
import { OrdersService } from '../services/orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Registra un pedido para llevar del cliente autenticado.',
    description:
      'Solo CLIENT. Modalidad ONLINE o AT_COUNTER, estado inicial PENDING y retiro estimado en 20 minutos. El total usa precios históricos del servidor. expectedPrice opcional detecta cambios con 409. operationKey permite reintentos 200 sin duplicar.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  @ApiOkResponse({
    type: OrderResponseDto,
    description: 'Reintento idéntico: devuelve el pedido existente.',
  })
  @ApiBadRequestResponse({
    description:
      'UUID, cantidades o líneas inválidas; campos adicionales no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere rol CLIENT.' })
  @ApiNotFoundResponse({ description: 'La sucursal no existe.' })
  @ApiConflictResponse({
    description:
      'Sucursal cerrada/inactiva, platillo no disponible o clave reutilizada con otro contenido.',
  })
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateOrderDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderResponseDto> {
    const result = await this.orders.create(user, body);
    response.status(result.created ? 201 : 200);
    return result.order;
  }

  @Post('salon')
  @ApiOperation({
    summary: 'Registra un pedido de salón para un mesero autenticado.',
    description:
      'Solo WAITER con sucursal activa. Reusa una cuenta abierta para la mesa o la crea dentro de la misma transacción, deja el estado inicial en PENDING y usa precios vigentes del servidor para el total. La mesa pasa a OCCUPIED en esa misma transacción desde AVAILABLE, NEEDS_CLEANING o RESERVED; OUT_OF_SERVICE rechaza el pedido. Si hay platillos no disponibles, el pedido no se crea y el 409 lista todos en unavailableDishes.',
  })
  @ApiCreatedResponse({ type: SalonOrderResponseDto })
  @ApiOkResponse({
    type: SalonOrderResponseDto,
    description: 'Reintento idéntico: devuelve el pedido existente.',
  })
  @ApiBadRequestResponse({
    description:
      'UUID, cantidades, líneas vacías o duplicadas; campos extra no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol WAITER asignado a una sucursal.',
  })
  @ApiNotFoundResponse({
    description: 'Mesa inexistente o fuera de la sucursal del mesero.',
  })
  @ApiConflictResponse({
    description:
      'Sucursal cerrada/inactiva, salón inactivo, mesa fuera de servicio, platillos no disponibles o clave reutilizada con otro contenido. En platillos no disponibles, dishId es el primero y unavailableDishes lista todos, sin repetir.',
  })
  async createSalon(
    @CurrentUser() user: User,
    @Body() body: CreateSalonOrderDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SalonOrderResponseDto> {
    const result = await this.orders.createSalon(user, body);
    response.status(result.created ? 201 : 200);
    return result.order;
  }
}