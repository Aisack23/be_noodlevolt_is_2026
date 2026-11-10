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
      'Incluye pedidos PENDING, IN_PREPARATION y READY con el estado persistido de cada línea.',
  })
  @ApiOkResponse({ type: KitchenOrderResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'Falta sesión válida.' })
  @ApiForbiddenResponse({
    description: 'Se requiere rol COOK asignado a una sucursal.',
  })
  list(@CurrentUser() user: User): Promise<KitchenOrderResponseDto[]> {
    return this.kitchen.list(user);
  }

  @Patch(':id/status')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({
    summary: 'Avanza un pedido de cocina.',
    description:
      'Solo permite PENDING → IN_PREPARATION → READY. Actualiza pedido y líneas en una transacción y deja auditoría.',
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
  updateStatus(
    @CurrentUser() user: User,
    @Param('id', orderIdPipe) orderId: string,
    @Body() input: UpdateKitchenOrderStatusDto,
  ): Promise<KitchenOrderResponseDto> {
    return this.kitchen.updateStatus(user, orderId, input);
  }
}
