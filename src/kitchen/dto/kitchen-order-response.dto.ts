import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class KitchenOrderItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  quantity!: number;

  @ApiPropertyOptional({ nullable: true })
  note!: string | null;

  @ApiProperty()
  status!: string;
}

export class KitchenOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  orderNumber!: string | null;

  @ApiProperty()
  type!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: [KitchenOrderItemResponseDto] })
  items!: KitchenOrderItemResponseDto[];
}
