import { ApiProperty } from '@nestjs/swagger';
import type { PublicMenu } from '../types/index.js';

export class MenuDishResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ramen de pollo' })
  nombre!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Ramen con pollo y vegetales.',
  })
  descripcion!: string | null;

  @ApiProperty({ type: String, example: '8.50', pattern: '^\\d+\\.\\d{2}$' })
  precio!: string;

  @ApiProperty({
    example: true,
    description: 'Disponible solo si el estado y los insumos lo permiten.',
  })
  disponible!: boolean;
}

export class MenuCategoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Platos fuertes' })
  nombre!: string;

  @ApiProperty({ type: [MenuDishResponseDto] })
  platillos!: MenuDishResponseDto[];
}

export class MenuBranchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'NoodleVolt Centro' })
  nombre!: string;
}

export class MenuResponseDto {
  @ApiProperty({ type: MenuBranchResponseDto })
  sucursal!: MenuBranchResponseDto;

  @ApiProperty({ type: [MenuCategoryResponseDto] })
  categorias!: MenuCategoryResponseDto[];

  static fromMenu(menu: PublicMenu): MenuResponseDto {
    return {
      sucursal: { id: menu.branch.id, nombre: menu.branch.name },
      categorias: menu.categories.map((category) => ({
        id: category.id,
        nombre: category.name,
        platillos: category.dishes.map((dish) => ({
          id: dish.id,
          nombre: dish.name,
          descripcion: dish.description,
          precio: dish.price.toFixed(2),
          disponible: dish.available,
        })),
      })),
    };
  }
}
