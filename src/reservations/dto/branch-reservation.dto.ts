import { ApiProperty } from '@nestjs/swagger';
import { ReservationStatus } from '@PrismaClient';

export class OperationalReservationDto {
  @ApiProperty()
  alias!: string;

  @ApiProperty()
  tableNumber!: string;

  @ApiProperty()
  guests!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  startsAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  endsAt!: Date;

}

export class AdministrativeReservationDto extends OperationalReservationDto {
  @ApiProperty({ enum: ReservationStatus })
  status!: ReservationStatus;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  tableId!: string;

  @ApiProperty()
  contactName!: string;

  @ApiProperty()
  phone!: string;
}

export class ReservationCancellationDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['CANCELED'] })
  status!: 'CANCELED';
}
