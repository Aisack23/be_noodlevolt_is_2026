import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsUUID, ValidateIf } from 'class-validator';

export class ListDishesQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Sucursal cuyo menú se consulta.',
  })
  @IsUUID()
  branchId!: string;

  @ApiPropertyOptional({ enum: ['active'], default: 'active' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Equals('active')
  status?: 'active';
}
