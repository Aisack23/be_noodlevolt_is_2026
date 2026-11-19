import { ApiProperty } from '@nestjs/swagger';

export class SalonOrderLineResponseDto {
  @ApiProperty({ format: 'uuid' })
  dishId!: string;

  @ApiProperty()
  dishName!: string;

  @ApiProperty({ minimum: 1 })
  quantity!: number;

  @ApiProperty({ example: '8.50' })
  unitPrice!: string;

  @ApiProperty({ type: String, nullable: true, maxLength: 200 })
  note!: string | null;
}

export class SalonOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ORD-000001', description: 'Número legible asignado al crear el pedido.' })
  orderNumber!: string;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'] })
  status!: string;

  @ApiProperty({ enum: ['DINE_IN'] })
  type!: 'DINE_IN';

  @ApiProperty({ example: '17.00' })
  total!: string;

  @ApiProperty({ format: 'uuid' })
  tableId!: string;

  @ApiProperty({ description: 'Número visible de la mesa en texto.' })
  tableNumber!: string;

  @ApiProperty({ format: 'uuid' })
  waiterId!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: [SalonOrderLineResponseDto] })
  lines!: SalonOrderLineResponseDto[];
}
