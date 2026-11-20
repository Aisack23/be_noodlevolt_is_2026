import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { describe, expect, it, vi } from 'vitest';
import { TopDishesController } from './top-dishes.controller.js';
import { TopDishesService } from '../services/top-dishes.service.js';

describe('TopDishesController', () => {
  it('expone el endpoint y lo documenta en Swagger', async () => {
    const service = {
      getTopDishes: vi.fn().mockResolvedValue({
        from: '2026-01-15',
        to: '2026-01-16',
        branchId: null,
        dishes: [],
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [TopDishesController],
      providers: [{ provide: TopDishesService, useValue: service }],
    }).compile();
    const app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('NoodleVolt API').setVersion('1.0').addBearerAuth().build(),
    );

    expect(document.paths['/api/v1/reports/top-dishes']).toBeDefined();
    expect(document.paths['/api/v1/reports/top-dishes']?.get).toBeDefined();
    await app.close();
  });
});

