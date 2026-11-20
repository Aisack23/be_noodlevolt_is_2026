import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MyOrderReviewResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 5 })
  rating!: number;
}

export class MyOrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ORD-000001' })
  orderNumber!: string;

  @ApiProperty({ enum: ['PENDING_PAYMENT', 'PENDING', 'CONFIRMED', 'IN_PREPARATION', 'READY', 'DELIVERED', 'CANCELED'] })
  status!: string;

  @ApiProperty({ example: '125.50' })
  total!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty() 
  branchName!: string;

  @ApiPropertyOptional({ type: MyOrderReviewResponseDto, nullable: true })
  review!: MyOrderReviewResponseDto | null;
}
