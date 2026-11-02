import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Res,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { isUUID } from 'class-validator';
import type { User } from '@PrismaClient';
import { CurrentUser } from '@Auth/decorators';
import { CreateTakeoutDto, TakeoutResponseDto } from '../dto/index.js';
import {
  TakeoutBranchInvalidError,
  TakeoutIdempotencyConflictError,
  TakeoutPriceConflictError,
  TakeoutUnavailableError,
} from '../errors/index.js';
import { TakeoutOrderService } from '../services/index.js';

@ApiTags('Pedidos para llevar')
@Controller('pedidos-llevar')
export class TakeoutOrderController {
  constructor(
    @Inject(TakeoutOrderService) private readonly service: TakeoutOrderService,
  ) {}

  // TODO(A) BE-A.2.1: restringir a CLIENT cuando exista el guard de roles.
  @Post()
  @HttpCode(201)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Confirma un pedido para llevar de forma idempotente',
    description:
      'Revalida disponibilidad y precios. Los platillos no disponibles responden 422; un precio cambiado responde 409. La modalidad de pago define el estado inicial. La hora de retiro se estima 20 minutos después en la zona de la sucursal.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'UUID que se reutiliza en reintentos del mismo carrito.',
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiCreatedResponse({
    description: 'Pedido creado; precios y total calculados en el servidor.',
    type: TakeoutResponseDto,
    example: {
      id: '10000000-0000-4000-8000-000000000001',
      estado: 'PENDIENTE',
      modalidadPago: 'EN_CAJA',
      lineas: [
        { nombre: 'Ramen', cantidad: 2, precio: '8.50', subtotal: '17.00' },
      ],
      total: '17.00',
      horaRetiro: '2026-11-02T12:20:00.000-06:00',
    },
  })
  @ApiOkResponse({
    description: 'Misma clave y contenido: se devuelve el pedido existente.',
    type: TakeoutResponseDto,
    example: {
      id: '10000000-0000-4000-8000-000000000001',
      estado: 'PENDIENTE',
      modalidadPago: 'EN_CAJA',
      lineas: [
        { nombre: 'Ramen', cantidad: 2, precio: '8.50', subtotal: '17.00' },
      ],
      total: '17.00',
      horaRetiro: '2026-11-02T12:20:00.000-06:00',
    },
  })
  @ApiBadRequestResponse({
    description:
      'Clave UUID ausente o inválida, carrito vacío, sucursal o línea inválida.',
    example: {
      statusCode: 400,
      message: 'La clave de idempotencia debe ser un UUID válido.',
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Se requiere sesión.',
    example: { statusCode: 401, message: 'Falta el token de acceso.' },
  })
  @ApiConflictResponse({
    description: 'Cambió el precio; no se creó el pedido.',
    example: {
      statusCode: 409,
      message: 'Los precios del carrito cambiaron.',
      preciosActuales: [
        {
          platilloId: '30000000-0000-4000-8000-000000000001',
          precioActual: '9.25',
        },
      ],
    },
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Platillos no disponibles o clave reutilizada con otro contenido.',
    examples: {
      unavailable: {
        summary: 'Platillo no disponible',
        value: {
          statusCode: 422,
          message: 'Hay platillos no disponibles.',
          platillos: [
            {
              platilloId: '30000000-0000-4000-8000-000000000001',
              nombre: 'Ramen',
            },
          ],
        },
      },
      repeatedKey: {
        summary: 'Clave reutilizada con otro contenido',
        value: {
          statusCode: 422,
          message: 'La clave de idempotencia ya se usó con otro contenido.',
        },
      },
    },
  })
  async create(
    @CurrentUser() user: User,
    @Headers('idempotency-key') operationId: string | undefined,
    @Body() body: CreateTakeoutDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TakeoutResponseDto> {
    if (!operationId || !isUUID(operationId))
      throw new BadRequestException(
        'La clave de idempotencia debe ser un UUID válido.',
      );
    try {
      const result = await this.service.create(
        user.id,
        operationId,
        body.toInput(),
      );
      response.status(result.created ? 201 : 200);
      return result.response;
    } catch (error) {
      if (error instanceof TakeoutBranchInvalidError)
        throw new BadRequestException(error.message);
      if (error instanceof TakeoutUnavailableError)
        throw new UnprocessableEntityException({
          message: error.message,
          platillos: error.dishes.map((dish) => ({
            platilloId: dish.dishId,
            nombre: dish.name,
          })),
        });
      if (error instanceof TakeoutPriceConflictError)
        throw new ConflictException({
          message: error.message,
          preciosActuales: error.prices.map((price) => ({
            platilloId: price.dishId,
            precioActual: price.currentPrice,
          })),
        });
      if (error instanceof TakeoutIdempotencyConflictError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }
  }
}
