import { Controller, Get, Inject, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '@Auth/decorators';
import { BranchResponseDto } from '../dto/branch-response.dto.js';
import { BranchesQueryService } from '../services/branches-query.service.js';

@ApiTags('branches')
@Controller('branches')
export class BranchesQueryController {
  constructor(
    @Inject(BranchesQueryService)
    private readonly service: BranchesQueryService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Lista todas las sucursales con datos básicos y estado.',
    description:
      'Público. Incluye inactivas, ordena por nombre e ID y devuelve [] si no hay sucursales. No expone auditoría ni usuarios.',
  })
  @ApiOkResponse({ type: BranchResponseDto, isArray: true })
  list(): Promise<BranchResponseDto[]> {
    return this.service.list();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Consulta los datos básicos y estado de una sucursal.',
  })
  @ApiOkResponse({ type: BranchResponseDto })
  @ApiBadRequestResponse({ description: 'El identificador debe ser un UUID.' })
  @ApiNotFoundResponse({ description: 'La sucursal no existe.' })
  find(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<BranchResponseDto> {
    return this.service.find(id);
  }
}
