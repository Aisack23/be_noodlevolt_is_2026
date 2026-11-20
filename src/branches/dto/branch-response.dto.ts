import { ApiProperty } from '@nestjs/swagger';

export class BranchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'NoodleVolt Centro' })
  name!: string;

  @ApiProperty()
  address!: string;

  @ApiProperty({ example: 'America/El_Salvador' })
  timeZone!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({
    description: 'False si está cerrada, inactiva o sin configuración.',
  })
  isOpen!: boolean;
}
