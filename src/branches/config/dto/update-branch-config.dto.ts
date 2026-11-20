import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateBranchConfigDto {
  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'true marca la sucursal ABIERTA y false, CERRADA.',
  })
  @IsBoolean({ message: 'isOpen debe ser verdadero o falso.' })
  isOpen!: boolean;
}
