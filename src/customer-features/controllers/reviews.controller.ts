import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { User } from '@PrismaClient';
import { CurrentUser, Public } from '@Auth/decorators';
import { CreateReviewDto } from '../dto/index.js';
import { ReviewsService } from '../services/index.js';

const branchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('El identificador de sucursal no es válido.'),
});

@ApiTags('Reseñas')
@Controller('reviews')
export class ReviewsController {
  constructor(@Inject(ReviewsService) private readonly service: ReviewsService) {}

  @ApiBearerAuth()
  @Post()
  @ApiOperation({
    summary: 'Crea una reseña para un pedido entregado del cliente autenticado.',
    description:
      'Solo pueden reseñar clientes autenticados. El pedido debe pertenecer al usuario y estar en estado DELIVERED. La reseña se crea con los datos del pedido y del usuario, nunca desde el cuerpo.',
  })
  @ApiCreatedResponse({
    description: 'La reseña fue creada correctamente.',
    schema: {
      example: {
        review: {
          id: '11111111-1111-4111-8111-111111111111',
          orderId: '22222222-2222-4222-8222-222222222222',
          customerId: '33333333-3333-4333-8333-333333333333',
          branchId: '44444444-4444-4444-8444-444444444444',
          rating: 5,
          comment: 'Excelente servicio',
          createdAt: '2026-11-06T22:00:00.000Z',
        },
        branchRating: { average: 4.5, count: 3 },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'El body o el UUID del pedido no son válidos.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: ['El identificador del pedido no es válido.'],
    },
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
    description: 'El pedido no pertenece al cliente autenticado.',
    example: {
      statusCode: 403,
      error: 'Forbidden',
      message: 'El pedido no pertenece al cliente.',
    },
  })
  @ApiNotFoundResponse({
    description: 'El pedido o la sucursal no existen.',
    example: {
      statusCode: 404,
      error: 'Not Found',
      message: 'El pedido no existe.',
    },
  })
  @ApiConflictResponse({
    description: 'El pedido no está entregado o ya tiene reseña.',
    example: {
      statusCode: 409,
      error: 'Conflict',
      message: 'Ya existe una reseña para este pedido.',
    },
  })
  async create(
    @CurrentUser() user: User,
    @Body() body: CreateReviewDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ review: unknown; branchRating: { average: number | null; count: number } }> {
    const result = await this.service.create(user, body);
    response.status(201);
    return result;
  }
}

@ApiTags('Sucursales')
@Controller('branches')
export class BranchesReviewsController {
  constructor(@Inject(ReviewsService) private readonly service: ReviewsService) {}

  @Public()
  @Get(':id/rating')
  @ApiOperation({
    summary: 'Obtiene el promedio y la cantidad de reseñas de una sucursal.',
    description:
      'Endpoint público para consultar la calificación de una sucursal. Devuelve la media de los ratings y el total de reseñas registradas.',
  })
  @ApiParam({
    name: 'id',
    type: String,
    format: 'uuid',
    description: 'UUID de la sucursal.',
  })
  @ApiOkResponse({
    description: 'Promedio y cantidad de reseñas de la sucursal.',
    schema: {
      example: {
        average: 4.5,
        count: 12,
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'El identificador de sucursal no tiene formato UUID válido.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'El identificador de sucursal no es válido.',
    },
  })
  @ApiNotFoundResponse({
    description: 'La sucursal no existe.',
    example: {
      statusCode: 404,
      error: 'Not Found',
      message: 'La sucursal no existe.',
    },
  })
  getBranchRating(
    @Param('id', branchIdPipe) branchId: string,
  ): Promise<{ average: number | null; count: number }> {
    return this.service.getBranchRating(branchId);
  }
}
