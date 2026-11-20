import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { User } from '@PrismaClient';
import { CurrentUser } from '@Auth/decorators';
import { MyOrdersQueryDto } from '../dto/my-orders-query.dto.js';
import { MyOrderResponseDto } from '../dto/my-order-response.dto.js';
import { MyOrdersService } from '../services/my-orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Controller('orders')
export class MyOrdersController {
  constructor(@Inject(MyOrdersService) private readonly service: MyOrdersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Lista los pedidos propios del cliente autenticado.',
    description:
      'Devuelve los pedidos del usuario del JWT, filtrados por status si se pasa y ordenados por createdAt desc. El límite es 50.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'],
    description: 'Estado del pedido para filtrar.',
  })
  @ApiOkResponse({
    type: MyOrderResponseDto,
    isArray: true,
    description: 'Lista de pedidos propios, [] si no hay resultados.',
  })
  @ApiBadRequestResponse({
    description: 'El valor de status no pertenece al enum OrderStatus.',
  })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere rol CLIENT.' })
  async list(
    @CurrentUser() user: User,
    @Query() query: MyOrdersQueryDto,
  ): Promise<MyOrderResponseDto[]> {
    return this.service.list(user, query);
  }
}
