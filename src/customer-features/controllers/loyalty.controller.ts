import { Controller, Get, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import { LoyaltyBalanceDto } from '../dto/loyalty-balance.dto.js';
import { LoyaltyService } from '../services/loyalty.service.js';

@ApiTags('Lealtad')
@ApiBearerAuth()
@Controller('loyalty')
export class LoyaltyController {
  constructor(
    @Inject(LoyaltyService) private readonly service: LoyaltyService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consulta el saldo de puntos del cliente autenticado.',
    description:
      'Solo CLIENT. La identidad proviene de la sesión. Cada pago PAID acredita floor(totalPaid) una sola vez; los rechazados no acreditan puntos. No recibe body ni un identificador de usuario.',
  })
  @ApiOkResponse({
    description: 'Saldo propio; cero si no existe cuenta.',
    type: LoyaltyBalanceDto,
  })
  @ApiUnauthorizedResponse({
    description:
      'Falta la sesión o el token es inválido, expiró o corresponde a una cuenta inactiva.',
  })
  @ApiForbiddenResponse({
    description: 'Solo los clientes pueden consultar su saldo de puntos.',
  })
  getBalance(@CurrentUser() user: User): Promise<LoyaltyBalanceDto> {
    return this.service.getBalance(user);
  }
}
