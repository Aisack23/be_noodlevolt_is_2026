import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  KitchenOrderResponseDto,
  UpdateKitchenOrderStatusDto,
} from '../dto/index.js';
import { KitchenService } from '../services/kitchen.service.js';

const orderIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('El identificador de pedido no es válido.'),
});

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('kitchen/orders')
export class KitchenController {
  constructor(
    @Inject(KitchenService) private readonly kitchen: KitchenService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista la cola persistida de la sucursal del personal de cocina.',
    description:
      'Incluye solo PENDING e IN_PREPARATION de la sucursal del cocinero, por createdAt ascendente, con notas por línea.',
  })
  @ApiOkResponse({ type: KitchenOrderResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol COOK asignado a una sucursal.',
  })
  list(@CurrentUser() user: User): Promise<KitchenOrderResponseDto[]> {
    return this.kitchen.list(user);
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Lista pedidos listos para el mesero de la sucursal.',
    description:
      'Solo READY de su sucursal. Orden ascendente por la última llegada a READY en el historial; si no existe, por createdAt. Incluye número, platillos, cantidades y notas. Los entregados dejan de aparecer.',
  })
  @ApiOkResponse({ type: KitchenOrderResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol WAITER asignado a una sucursal.',
  })
  listReady(@CurrentUser() user: User): Promise<KitchenOrderResponseDto[]> {
    return this.kitchen.listReady(user);
  }

  @Patch(':id/deliver')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Confirma la entrega de un pedido listo.',
    description:
      'Solo WAITER de la sucursal puede avanzar READY a DELIVERED. No requiere body. Repetir DELIVERED devuelve 200 con el pedido sin cambios: conserva updatedBy y updatedAt, sin nuevo historial ni aviso.',
  })
  @ApiOkResponse({ type: KitchenOrderResponseDto })
  @ApiBadRequestResponse({ description: 'UUID inválido.' })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol WAITER asignado a una sucursal.',
  })
  @ApiNotFoundResponse({
    description: 'El pedido no existe en la sucursal del usuario.',
  })
  @ApiConflictResponse({ description: 'El pedido no está READY ni DELIVERED.' })
  deliver(
    @CurrentUser() user: User,
    @Param('id', orderIdPipe) orderId: string,
  ): Promise<KitchenOrderResponseDto> {
    return this.kitchen.deliver(user, orderId);
  }

  @Patch(':id/status')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Avanza un pedido de cocina.',
    description:
      'Solo permite PENDING → IN_PREPARATION → READY. Actualiza pedido y líneas en una transacción y deja auditoría. READY registra PEDIDO_LISTO para el cliente, si existe. Repetir el estado actual devuelve 200 con el pedido sin cambios: conserva updatedBy y updatedAt, sin nuevo historial ni aviso.',
  })
  @ApiOkResponse({ type: KitchenOrderResponseDto })
  @ApiBadRequestResponse({ description: 'UUID o estado de cocina inválido.' })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol COOK asignado a la sucursal.',
  })
  @ApiNotFoundResponse({
    description: 'El pedido no existe en la sucursal del usuario.',
  })
  @ApiConflictResponse({
    description: 'La transición no corresponde al estado persistido.',
  })
  @ApiBody({ type: UpdateKitchenOrderStatusDto })
  updateStatus(
    @CurrentUser() user: User,
    @Param('id', orderIdPipe) orderId: string,
    @Body() input: UpdateKitchenOrderStatusDto,
  ): Promise<KitchenOrderResponseDto> {
    return this.kitchen.updateStatus(user, orderId, input);
  }
}
