import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsISO8601,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2027-01-10T19:00:00-06:00',
    description: 'Fecha futura ISO 8601 con Z u offset explícito.',
  })
  @IsString()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/)
  startsAt!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Mesa concreta; si se omite, asignación automática.',
  })
  @IsOptional()
  @IsUUID()
  tableId?: string;

  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  guests!: number;

  @ApiProperty({ minLength: 1, maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  contactName!: string;

  @ApiProperty({ example: '+50370000000', maxLength: 30 })
  @IsString()
  @Matches(/^\+?(?=(?:\D*\d){7})[0-9 ()-]{7,30}$/)
  phone!: string;
}
