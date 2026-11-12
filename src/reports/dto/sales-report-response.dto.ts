import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Prisma } from '@PrismaClient';

export class SalesReportResponseDto {
  @ApiProperty({ example: '2026-01-15' })
  from!: string;

  @ApiProperty({ example: '2026-01-16' })
  to!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'Sucursal consultada. Cuando se consolida todo, es null.',
  })
  branchId!: string | null;

  @ApiProperty({ example: '123.45', description: 'Total de ventas aprobadas en formato string con dos decimales.' })
  total!: string;

  @ApiProperty({ example: 2, description: 'Cantidad de pagos aprobados incluidos en el total.' })
  paymentsCount!: number;

  static from(params: {
    from: string;
    to: string;
    branchId: string | null;
    total: Prisma.Decimal;
    paymentsCount: number;
  }): SalesReportResponseDto {
    return {
      from: params.from,
      to: params.to,
      branchId: params.branchId,
      total: params.total.toFixed(2),
      paymentsCount: params.paymentsCount,
    };
  }
}
