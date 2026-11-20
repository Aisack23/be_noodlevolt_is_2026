import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { EnvConfig } from '@Config';
import { HttpSecurityService } from './security/http-security.service.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvConfig, true>);
  app.get(HttpSecurityService).install(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.enableShutdownHooks();
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swagger = new DocumentBuilder()
      .setTitle('NoodleVolt API')
      .setDescription('API REST de NoodleVolt.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }
}
