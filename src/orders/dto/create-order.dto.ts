import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsIn,
  IsString,
  Matches,
  ValidateIf,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderLineDto {
  @ApiPropertyOptional({
    type: String,
    example: '8.50',
    description: 'Precio visto por el cliente; si cambió, responde 409.',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,2})?$/)
  expectedPrice?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dishId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;
}

export class CreateOrderDto {
  @ApiPropertyOptional({ enum: ['ONLINE', 'AT_COUNTER'], default: 'ONLINE' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['ONLINE', 'AT_COUNTER'])
  paymentMode?: 'ONLINE' | 'AT_COUNTER';

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Clave estable para reintentar el mismo pedido.',
  })
  @IsUUID()
  operationKey!: string;

  @ApiProperty({ type: [CreateOrderLineDto], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique((line: CreateOrderLineDto) =>
    typeof line?.dishId === 'string' ? line.dishId.toLowerCase() : line?.dishId,
  )
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines!: CreateOrderLineDto[];
}
