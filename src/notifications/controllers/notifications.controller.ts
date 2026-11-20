import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '@Auth/decorators';
import type { User } from '@PrismaClient';
import {
  NotificationResponseDto,
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

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Marca un aviso propio como leído de forma idempotente.',
    description:
      'Sin cuerpo o con {}. No permite marcar avisos ajenos, cambiar destinatario ni volver a no leído. Repetir la operación devuelve 200 con isRead=true.',
  })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiBadRequestResponse({ description: 'UUID inválido o cuerpo no vacío.' })
  @ApiUnauthorizedResponse({ description: 'Se requiere sesión válida.' })
  @ApiForbiddenResponse({ description: 'Se requiere CLIENT.' })
  @ApiNotFoundResponse({
    description: 'Aviso inexistente o perteneciente a otro usuario.',
  })
  markRead(
    @CurrentUser() user: User,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
  ): Promise<NotificationResponseDto> {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new BadRequestException(
        'Esta operación no admite datos en el cuerpo.',
      );
    }
    return this.service.markOwnAsRead(user, id);
  }

  @Get('me')
  @ApiOperation({
    summary: 'Consulta el buzón propio del cliente autenticado.',
    description:
      'Orden descendente por fecha e ID. items=[] y total=0 representan un buzón vacío. unreadCount cuenta todos los avisos sin leer. No admite userId ni modifica avisos al consultarlos.',
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
