import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderLineDto {
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
