import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { RewardType, RedemptionStatus } from '@PrismaClient';

export class CreateRedemptionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  benefitId!: string;

  @ApiProperty({
    format: 'uuid',
    description:
      'Pedido propio para llevar PENDING, sin pago aprobado ni otro canje.',
  })
  @IsUUID()
  orderId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Clave estable para reintentar el mismo canje.',
  })
  @IsUUID()
  operationKey!: string;
}

export class RewardResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty()
  pointsCost!: number;

  @ApiProperty({ enum: RewardType })
  rewardType!: RewardType;

  @ApiProperty({ type: String, nullable: true })
  productName!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  discountPercent!: number | null;
}

export class RedemptionOrderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ type: String, nullable: true })
  total!: string | null;

  @ApiProperty({ example: '1.70' })
  discount!: string;
}

export class RedemptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  benefitId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  pointsCost!: number;

  @ApiProperty()
  rewardName!: string;

  @ApiProperty({ enum: RewardType, nullable: true })
  rewardType!: RewardType | null;

  @ApiProperty({ type: String, nullable: true })
  productName!: string | null;

  @ApiProperty({ type: Number, nullable: true })
  discountPercent!: number | null;

  @ApiProperty({ enum: RedemptionStatus })
  status!: RedemptionStatus;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  usedAt!: string | null;

  @ApiProperty({ type: RedemptionOrderDto, nullable: true })
  order!: RedemptionOrderDto | null;
}

export class RedemptionsResponseDto {
  @ApiProperty({ type: [RedemptionResponseDto] })
  items!: RedemptionResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
