import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  NotificationsQueryDto,
  NotificationsResponseDto,
} from '../dto/notification.dto.js';
import { NotificationsService } from '../services/notifications.service.js';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NotificationsService)
    private readonly service: NotificationsService,
  ) {}

  @Get('me')
  @ApiOperation({
    summary: 'Consulta el buzón propio del cliente autenticado.',
    description:
      'Orden descendente por fecha e ID. items=[] y total=0 representan un buzón vacío. No admite userId ni modifica avisos al consultarlos.',
  })
  @ApiOkResponse({ type: NotificationsResponseDto })
  @ApiBadRequestResponse({
    description: 'Paginación inválida o parámetros no permitidos.',
  })
  @ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere CLIENT.' })
  listOwn(
    @CurrentUser() user: User,
    @Query() query: NotificationsQueryDto,
  ): Promise<NotificationsResponseDto> {
    return this.service.listOwn(user, query.page, query.limit);
  }
}
