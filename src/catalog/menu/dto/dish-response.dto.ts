import { ApiProperty } from '@nestjs/swagger';

export class DishCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class DishResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, example: '8.50', pattern: '^\\d+\\.\\d{2}$' })
  price!: string;

  @ApiProperty({ example: true })
  isAvailable!: boolean;

  @ApiProperty({ type: DishCategoryResponseDto })
  category!: DishCategoryResponseDto;
}
