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
import { OrderResponseDto } from '../dto/order-response.dto.js';
import { OrdersService } from '../services/orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(@Inject(OrdersService) private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Registra un pedido para llevar del cliente autenticado.',
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
}
