import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSalonOrderLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dishId!: string;

  @ApiProperty({ minimum: 1, maximum: 20 })
  @IsInt()
  @Min(1)
  @Max(20)
  quantity!: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 200,
    description: 'Nota opcional de la línea; se normaliza y acepta null.',
  })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(200)
  note?: string | null;
}

export class CreateSalonOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  tableId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'Clave estable para reintentar el mismo pedido en la mesa.',
  })
  @IsUUID()
  operationKey!: string;

  @ApiProperty({
    type: [CreateSalonOrderLineDto],
    minItems: 1,
    maxItems: 100,
    description: 'Líneas con platillos y notas para una comanda en salón.',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateSalonOrderLineDto)
  lines!: CreateSalonOrderLineDto[];
}
