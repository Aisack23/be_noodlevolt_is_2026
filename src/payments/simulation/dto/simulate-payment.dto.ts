import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class SimulatePaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId!: string;

  @ApiProperty({
    enum: ['test_4242', 'test_0002'],
    description: 'Token de prueba; nunca enviar PAN ni CVV.',
  })
  @IsIn(['test_4242', 'test_0002'])
  cardToken!: 'test_4242' | 'test_0002';
}
