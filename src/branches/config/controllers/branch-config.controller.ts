import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser, Public } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  BranchConfigResponseDto,
  BranchStatusResponseDto,
  UpdateBranchConfigDto,
} from '../dto/index.js';
import { BranchConfigService } from '../services/index.js';

const branchIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException('El identificador de sucursal no es válido.'),
});

const NOT_FOUND = {
  description: 'La sucursal no existe, está inactiva o no está configurada.',
  example: {
    statusCode: 404,
    error: 'Not Found',
    message: 'La sucursal no existe.',
  },
};

@ApiTags('Estado de sucursal')
@ApiParam({
  name: 'id',
  type: String,
  format: 'uuid',
  description: 'UUID de la sucursal.',
})
@Controller('branches')
export class BranchConfigController {
  constructor(
    @Inject(BranchConfigService) private readonly service: BranchConfigService,
  ) {}

  @Public()
  @Get(':id/config')
  @ApiOperation({
    summary: 'Consulta si una sucursal está abierta sin iniciar sesión',
    description:
      'Solo expone isOpen: true significa ABIERTA y false, CERRADA. Una sucursal cerrada sigue mostrando su menú, pero no recibe pedidos.',
  })
  @ApiOkResponse({
    description: 'Estado vigente de la sucursal.',
    type: BranchStatusResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'El identificador no tiene formato UUID válido.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: 'El identificador de sucursal no es válido.',
    },
  })
  @ApiNotFoundResponse(NOT_FOUND)
  getStatus(
    @Param('id', branchIdPipe) branchId: string,
  ): Promise<BranchStatusResponseDto> {
    return this.service.getStatus(branchId);
  }

  @ApiBearerAuth()
  @Patch(':id/config')
  @ApiOperation({
    summary: 'Marca la sucursal como abierta o cerrada',
    description:
      'Exclusivo del GERENTE asignado a la sucursal indicada en la ruta. El rol y la sucursal se obtienen del usuario autenticado, nunca del cuerpo. Registra quién hizo el cambio y cuándo.',
  })
  @ApiBody({ type: UpdateBranchConfigDto })
  @ApiOkResponse({
    description: 'Estado guardado con su auditoría.',
    type: BranchConfigResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'El identificador no es un UUID, isOpen no es booleano o el cuerpo trae propiedades no permitidas, como la sucursal.',
    example: {
      statusCode: 400,
      error: 'Bad Request',
      message: ['isOpen debe ser verdadero o falso.'],
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Falta el token de acceso o no es válido.',
    example: {
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Falta el token de acceso.',
    },
  })
  @ApiForbiddenResponse({
    description:
      'El usuario no es GERENTE o pertenece a otra sucursal. El estado no se modifica.',
    example: {
      statusCode: 403,
      error: 'Forbidden',
      message: 'Solo el gerente de la sucursal puede cambiar su estado.',
    },
  })
  @ApiNotFoundResponse(NOT_FOUND)
  updateStatus(
    @CurrentUser() user: User,
    @Param('id', branchIdPipe) branchId: string,
    @Body() body: UpdateBranchConfigDto,
  ): Promise<BranchConfigResponseDto> {
    return this.service.updateStatus(user, branchId, body.isOpen);
  }
}
