import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@PrismaClient';

export class MyOrdersQueryDto {
  @ApiPropertyOptional({
    enum: OrderStatus,
    description: 'Filtrar por estado del pedido. Si se omite, devuelve todos los propios.',
  })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
