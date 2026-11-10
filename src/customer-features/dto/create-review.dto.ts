import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({
    description: 'Identificador del pedido asociado a la reseña.',
    format: 'uuid',
  })
  @IsUUID()
  orderId!: string;

  @ApiProperty({
    description: 'Puntuación de la reseña.',
    minimum: 1,
    maximum: 5,
    example: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({
    description: 'Comentario opcional de la reseña.',
    maxLength: 500,
    example: 'Excelente atención y servicio.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
