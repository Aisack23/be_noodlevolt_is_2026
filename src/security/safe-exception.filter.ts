import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    if (error instanceof HttpException && error.getStatus() < 500) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: error.getStatus(), message: body }
            : body,
        );
      return;
    }
    const parserType =
      typeof error === 'object' && error !== null && 'type' in error
        ? error.type
        : null;
    if (
      parserType === 'entity.too.large' ||
      parserType === 'entity.parse.failed' ||
      parserType === 'parameters.too.many' ||
      parserType === 'encoding.unsupported' ||
      parserType === 'charset.unsupported'
    ) {
      const status =
        parserType === 'entity.parse.failed'
          ? 400
          : ['encoding.unsupported', 'charset.unsupported'].includes(parserType)
            ? 415
            : 413;
      response.status(status).json({
        statusCode: status,
        message:
          'El cuerpo de la solicitud no es válido o supera el límite permitido.',
      });
      return;
    }
    this.logger.error({
      event: 'internal_error',
      requestId: response.getHeader('X-Request-Id') ?? null,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    response
      .status(500)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}
