import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { TakeoutInput } from '../types/index.js';

export class CreateTakeoutLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, {
    message: 'El identificador de platillo debe ser un UUID válido.',
  })
  platilloId!: string;

  @ApiProperty({ minimum: 1, maximum: 20, example: 2 })
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'La cantidad debe estar entre 1 y 20.' })
  @Max(20, { message: 'La cantidad debe estar entre 1 y 20.' })
  cantidad!: number;

  @ApiProperty({ type: String, example: '8.50' })
  @IsString({ message: 'El precio esperado debe ser un texto decimal.' })
  @Matches(/^\d{1,6}(?:\.\d{1,2})?$/, {
    message:
      'El precio esperado debe tener hasta seis enteros y dos decimales.',
  })
  precioEsperado!: string;
}

export class CreateTakeoutDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID(undefined, {
    message: 'El identificador de sucursal debe ser un UUID válido.',
  })
  sucursalId!: string;

  @ApiProperty({ enum: ['EN_LINEA', 'EN_CAJA'], example: 'EN_CAJA' })
  @IsIn(['EN_LINEA', 'EN_CAJA'], {
    message: 'La modalidad de pago debe ser EN_LINEA o EN_CAJA.',
  })
  modalidadPago!: 'EN_LINEA' | 'EN_CAJA';

  @ApiProperty({ type: [CreateTakeoutLineDto], minItems: 1 })
  @IsArray({ message: 'Las líneas deben ser una lista.' })
  @ArrayNotEmpty({ message: 'El carrito no puede estar vacío.' })
  @ValidateNested({
    each: true,
    message: 'Cada línea debe ser un objeto válido.',
  })
  @Type(() => CreateTakeoutLineDto)
  lineas!: CreateTakeoutLineDto[];

  toInput(): TakeoutInput {
    return {
      branchId: this.sucursalId,
      paymentMode: this.modalidadPago === 'EN_LINEA' ? 'ONLINE' : 'AT_COUNTER',
      lines: this.lineas.map((line) => ({
        dishId: line.platilloId,
        quantity: line.cantidad,
        expectedPrice: line.precioEsperado,
      })),
    };
  }
}
