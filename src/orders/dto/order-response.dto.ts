import { ApiProperty } from '@nestjs/swagger';

export class OrderLineResponseDto {
  @ApiProperty({ format: 'uuid' })
  dishId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiProperty({ example: '8.50' })
  unitPrice!: string;

  @ApiProperty({ example: '17.00' })
  subtotal!: string;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  operationKey!: string;

  @ApiProperty({
    description:
      'Estado persistido; PENDING al crear, equivalente a PENDIENTE.',
  })
  status!: string;

  @ApiProperty({ example: '17.00' })
  total!: string;

  @ApiProperty({ type: [OrderLineResponseDto] })
  lines!: OrderLineResponseDto[];
}
