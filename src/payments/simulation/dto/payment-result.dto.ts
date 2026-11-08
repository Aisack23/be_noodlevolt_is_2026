import { ApiProperty } from '@nestjs/swagger';

export class SimpleReceiptDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty({ example: '17.00' })
  amount!: string;

  @ApiProperty({ format: 'date-time' })
  issuedAt!: string;
}

export class PaymentResultDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ enum: ['APROBADO', 'RECHAZADO'] })
  status!: 'APROBADO' | 'RECHAZADO';

  @ApiProperty({ example: '17.00' })
  amount!: string;

  @ApiProperty({ enum: ['4242', '0002'] })
  last4!: string;

  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: SimpleReceiptDto, nullable: true })
  receipt!: SimpleReceiptDto | null;
}
