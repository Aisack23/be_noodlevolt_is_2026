import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CreateReservationDto } from './create-reservation.dto.js';

export class ReservationAvailabilityDto extends PickType(CreateReservationDto, [
  'branchId',
  'startsAt',
] as const) {
  @ApiProperty({ minimum: 1, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  guests!: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roomId?: string;
}

export class AvailableReservationTableDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  branchId!: string;
  @ApiProperty({ nullable: true, format: 'uuid', type: String })
  roomId!: string | null;
  @ApiProperty()
  number!: string;
  @ApiProperty()
  capacity!: number;
}
