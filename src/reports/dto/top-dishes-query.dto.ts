import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class TopDishesQueryDto {
  @ApiProperty({
    example: '2026-01-15',
    description: 'Fecha inicial del rango, inclusive, en formato YYYY-MM-DD.',
  })
  @Type(() => String)
  @IsNotEmpty()
  @Matches(DATE_PATTERN, {
    message: 'El parámetro from debe tener formato YYYY-MM-DD.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  from!: string;

  @ApiProperty({
    example: '2026-01-16',
    description: 'Fecha final del rango, inclusive, en formato YYYY-MM-DD.',
  })
  @Type(() => String)
  @IsNotEmpty()
  @Matches(DATE_PATTERN, {
    message: 'El parámetro to debe tener formato YYYY-MM-DD.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  to!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'Sucursal a consultar. Los BRANCH_ADMIN solo pueden consultar la suya. GENERAL_MANAGER puede dejarlo vacío para consolidar todas.',
  })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    return String(value).trim();
  })
  branchId?: string;

  @ApiPropertyOptional({
    default: 10,
    minimum: 1,
    maximum: 100,
    description: 'Cantidad máxima de platillos a devolver.',
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;
}

