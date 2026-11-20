import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { ListDishesQueryDto } from '../dto/list-dishes-query.dto.js';
import { DishResponseDto } from '../dto/dish-response.dto.js';
import { MenuService } from '../services/menu.service.js';

@ApiTags('dishes')
@Controller('dishes')
export class DishesController {
  constructor(@Inject(MenuService) private readonly menu: MenuService) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Consulta pública de platillos disponibles por sucursal.',
    description:
      'Ordena por categoría y nombre. Excluye eliminados, no disponibles, agotados, deshabilitados y categorías inactivas. Los precios son strings decimales con dos posiciones. No depende del estado abierto/cerrado.',
  })
  @ApiOkResponse({
    type: DishResponseDto,
    isArray: true,
    description: 'Menú disponible; [] si no hay platillos.',
  })
  @ApiBadRequestResponse({
    description:
      'branchId obligatorio con formato UUID; solo se admite status=active.',
  })
  @ApiNotFoundResponse({
    description: 'La sucursal no existe o está inactiva.',
  })
  list(@Query() query: ListDishesQueryDto): Promise<DishResponseDto[]> {
    return this.menu.listAvailableDishes(query.branchId);
  }
}
