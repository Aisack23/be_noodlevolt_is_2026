import { ApiProperty } from '@nestjs/swagger';
import { TableStatus } from '@PrismaClient';

export class DiningRoomDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class DiningRoomResponseDto extends DiningRoomDto {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({
    description: 'Todas las mesas asignadas, en cualquier estado.',
  })
  tableCount!: number;
}

export class DiningTableResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  number!: string;

  @ApiProperty()
  capacity!: number;

  @ApiProperty({ enum: TableStatus })
  status!: TableStatus;

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  roomId!: string | null;

  @ApiProperty({ type: DiningRoomDto, nullable: true })
  room!: DiningRoomDto | null;
}

class DiningPageMetadataDto {
  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class DiningRoomsResponseDto extends DiningPageMetadataDto {
  @ApiProperty({ type: [DiningRoomResponseDto] })
  items!: DiningRoomResponseDto[];
}

export class DiningTablesResponseDto extends DiningPageMetadataDto {
  @ApiProperty({ type: [DiningTableResponseDto] })
  items!: DiningTableResponseDto[];
}
