import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdateKitchenOrderStatusDto {
  @ApiProperty({
    enum: ['IN_PREPARATION', 'READY'],
    description: 'Siguiente estado del pedido dentro del flujo de cocina.',
  })
  @IsIn(['IN_PREPARATION', 'READY'])
  status!: 'IN_PREPARATION' | 'READY';
}
