import { ApiProperty } from '@nestjs/swagger';
import type { BranchConfig } from '@PrismaClient';

export class BranchStatusResponseDto {
  @ApiProperty({
    type: Boolean,
    example: true,
    description: 'true significa ABIERTA y false, CERRADA.',
  })
  isOpen!: boolean;

  static fromIsOpen(isOpen: boolean): BranchStatusResponseDto {
    return { isOpen };
  }
}

export class BranchConfigResponseDto extends BranchStatusResponseDto {
  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Fecha y hora del último cambio.',
  })
  updatedAt!: Date;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Usuario que hizo el último cambio.',
  })
  updatedBy!: string | null;

  static fromConfig(config: BranchConfig): BranchConfigResponseDto {
    return {
      isOpen: config.isOpen,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy,
    };
  }
}
