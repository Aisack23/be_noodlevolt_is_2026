import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TopDishDto {
  @ApiProperty({ format: 'uuid' })
  dishId!: string;

  @ApiProperty({ example: 'Ramen tradicional' })
  dishName!: string;

  @ApiProperty({ example: 12 })
  quantity!: number;
}

export class TopDishesResponseDto {
  @ApiProperty({ example: '2026-01-15' })
  from!: string;

  @ApiProperty({ example: '2026-01-16' })
  to!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    example: null,
    description: 'Sucursal consultada. Cuando se consolida todo, es null.',
  })
  branchId!: string | null;

  @ApiProperty({ type: [TopDishDto] })
  dishes!: TopDishDto[];

  static from(params: {
    from: string;
    to: string;
    branchId: string | null;
    dishes: TopDishDto[];
  }): TopDishesResponseDto {
    return {
      from: params.from,
      to: params.to,
      branchId: params.branchId,
      dishes: params.dishes,
    };
  }
}

