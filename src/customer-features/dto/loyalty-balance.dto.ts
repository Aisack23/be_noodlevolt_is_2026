import { ApiProperty } from '@nestjs/swagger';

export class LoyaltyBalanceDto {
  @ApiProperty({
    description: 'Saldo del cliente autenticado; cero si aún no tiene cuenta.',
    example: 12,
    minimum: 0,
    type: 'integer',
  })
  points: number;
}
