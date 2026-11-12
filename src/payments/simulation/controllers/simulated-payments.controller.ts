import { Body, Controller, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { SimulatePaymentDto } from '../dto/simulate-payment.dto.js';
import { PaymentResultDto } from '../dto/payment-result.dto.js';
import { SimulatedPaymentsService } from '../services/simulated-payments.service.js';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class SimulatedPaymentsController {
  constructor(
    @Inject(SimulatedPaymentsService)
    private readonly payments: SimulatedPaymentsService,
  ) {}

  @Post('simulate')
  @ApiOperation({
    summary:
      'Simula un pago en dos segundos sin recibir datos de tarjeta reales.',
  })
  @ApiCreatedResponse({
    type: PaymentResultDto,
    description: 'Intento registrado: consultar status APROBADO o RECHAZADO.',
  })
  @ApiBadRequestResponse({
    description:
      'Pedido o token de prueba inválido; campos adicionales no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere CLIENT y pedido propio.' })
  @ApiNotFoundResponse({ description: 'El pedido no existe.' })
  @ApiConflictResponse({
    description:
      'El pedido no es para llevar, ya está pagado, está cancelado o no tiene un importe válido.',
  })
  simulate(
    @CurrentUser() user: User,
    @Body() input: SimulatePaymentDto,
  ): Promise<PaymentResultDto> {
    return this.payments.simulate(user, input);
  }
}
