import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { MenuResponseDto } from '../dto/index.js';
import { MenuService } from '../services/index.js';

@ApiTags('Menú público')
@Controller('sucursales')
export class MenuController {
  constructor(@Inject(MenuService) private readonly service: MenuService) {}

  @Public()
  @Get(':sucursalId/menu')
  @ApiOperation({
    summary: 'Consulta el menú vigente de una sucursal sin iniciar sesión',
    description:
      'Excluye deshabilitados y categorías sin platillos visibles. Incluye agotados como no disponibles. Ordena categorías y platillos por nombre; los precios se expresan en dólares con dos decimales.',
  })
  @ApiParam({
    name: 'sucursalId',
    type: String,
    format: 'uuid',
    description: 'UUID de la sucursal.',
  })
  @ApiOkResponse({
    description:
      'Sucursal y categorías con sus platillos visibles. Una sucursal sin platillos visibles tiene categorias: [].',
    type: MenuResponseDto,
    example: {
      sucursal: {
        id: '10000000-0000-4000-8000-000000000001',
        nombre: 'NoodleVolt Centro',
      },
      categorias: [
        {
          id: '20000000-0000-4000-8000-000000000001',
          nombre: 'Platos fuertes',
          platillos: [
            {
              id: '30000000-0000-4000-8000-000000000001',
              nombre: 'Ramen de pollo',
              descripcion: 'Con pollo y vegetales.',
              precio: '8.50',
              disponible: true,
            },
          ],
        },
      ],
    },
  })
  @ApiBadRequestResponse({
    description: 'El identificador no tiene formato UUID válido.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'El identificador de sucursal debe ser un UUID válido.',
    },
  })
  @ApiNotFoundResponse({
    description: 'La sucursal no existe.',
    example: {
      statusCode: 404,
      error: 'Not Found',
      message: 'La sucursal no existe.',
    },
  })
  getMenu(
    @Param(
      'sucursalId',
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new BadRequestException(
            'El identificador de sucursal debe ser un UUID válido.',
          ),
      }),
    )
    branchId: string,
  ): Promise<MenuResponseDto> {
    return this.service.getMenu(branchId);
  }
}
