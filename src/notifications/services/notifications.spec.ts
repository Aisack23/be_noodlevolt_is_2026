import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import type { Prisma } from '@PrismaClient';
import { NotificationsController } from '../controllers/notifications.controller.js';
import { NotificationsRepository } from '../repositories/notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
const userId = '10000000-0000-4000-8000-000000000001';

describe('BE-09: sesión, buzón e integración interna', () => {
  const repository = {
    findOwn: vi.fn(),
    createOrderReady: vi.fn(),
    markOwnAsRead: vi.fn(),
  };
  const users = { findById: vi.fn() };
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') });
  let app: INestApplication;
  let service: NotificationsService;
  let token: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repository },
        {
          provide: APP_GUARD,
          useValue: new JwtAuthGuard(
            new Reflector(),
            jwt,
            users as unknown as UsersService,
          ),
        },
      ],
    }).compile();
    service = module.get(NotificationsService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    token = await jwt.signAsync({ sub: userId });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue({
      id: userId,
      role: 'CLIENT',
      isActive: true,
    });
    repository.findOwn.mockResolvedValue({
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 20,
    });
  });
  afterAll(async () => {
    await app.close();
  });
  const notificationId = '20000000-0000-4000-8000-000000000001';
  const patch = (id = notificationId) =>
    request(app.getHttpServer())
      .patch(`/api/v1/notifications/${id}/read`)
      .set('Authorization', `Bearer ${token}`);
  it('marca usando el propietario de sesión y responde isRead=true', async () => {
    repository.markOwnAsRead.mockResolvedValue({
      id: notificationId,
      isRead: true,
    });
    await patch().expect(200, { id: notificationId, isRead: true });
    expect(repository.markOwnAsRead).toHaveBeenCalledWith(
      userId,
      notificationId,
    );
  });
  it('PATCH requiere sesión válida', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/notifications/${notificationId}/read`)
      .expect(401);
    expect(repository.markOwnAsRead).not.toHaveBeenCalled();
  });
  it('usa el mismo 404 para un aviso ausente o ajeno', async () => {
    repository.markOwnAsRead.mockResolvedValue(null);
    await patch().expect(404);
  });
  it('rechaza UUID inválido antes de acceder a datos', async () => {
    await patch('invalid').expect(400);
    expect(repository.markOwnAsRead).not.toHaveBeenCalled();
  });
  it.each([{ isRead: false }, { userId: 'other' }, []])(
    'rechaza cuerpo no permitido %#',
    async (body) => {
      await patch().send(body).expect(400);
      expect(repository.markOwnAsRead).not.toHaveBeenCalled();
    },
  );
  const get = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/v1/notifications/me${query}`)
      .set('Authorization', `Bearer ${token}`);
  it('responde con un buzón vacío explícito y usa identidad de sesión', async () => {
    await get().expect(200, {
      items: [],
      total: 0,
      unreadCount: 0,
      page: 1,
      limit: 20,
    });
    expect(repository.findOwn).toHaveBeenCalledWith(userId, 1, 20);
  });
  it('requiere sesión válida', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/notifications/me')
      .expect(401);
  });
  it.each([
    'COOK',
    'WAITER',
    'BRANCH_ADMIN',
    'GENERAL_MANAGER',
    'CASHIER',
    'INVENTORY_MANAGER',
  ])('rechaza el rol %s', async (role) => {
    users.findById.mockResolvedValue({ id: userId, role, isActive: true });
    await get().expect(403);
    await patch().expect(403);
    expect(repository.markOwnAsRead).not.toHaveBeenCalled();
    expect(repository.findOwn).not.toHaveBeenCalled();
  });
  it.each([
    '?userId=other',
    '?page=0',
    '?limit=101',
    '?page=1.5',
    '?limit=bad',
    '?page=1&page=2',
  ])('rechaza parámetros %s', async (query) => {
    await get(query).expect(400);
    expect(repository.findOwn).not.toHaveBeenCalled();
  });
  it('no publica una ruta para crear notificaciones arbitrarias', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId })
      .expect(404);
  });
  it('usa la transacción recibida y el propietario real al emitir READY', async () => {
    const order = {
      id: 'order',
      customerId: userId,
      status: 'READY',
      orderNumber: 'A1',
      branch: { name: 'Centro' },
    };
    const tx = {
      order: { findUniqueOrThrow: vi.fn().mockResolvedValue(order) },
    };
    await service.notifyOrderReady(
      order.id,
      tx as unknown as Prisma.TransactionClient,
    );
    expect(repository.createOrderReady).toHaveBeenCalledWith(tx, order);
  });
  it('no crea un aviso sin destinatario', async () => {
    const tx = {
      order: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ status: 'READY', customerId: null }),
      },
    };
    expect(
      await service.notifyOrderReady(
        'order',
        tx as unknown as Prisma.TransactionClient,
      ),
    ).toBeNull();
    expect(repository.createOrderReady).not.toHaveBeenCalled();
  });
  it('no emite aviso si aún no se confirma READY', async () => {
    const tx = {
      order: {
        findUniqueOrThrow: vi
          .fn()
          .mockResolvedValue({ status: 'PENDING', customerId: userId }),
      },
    };
    await expect(
      service.notifyOrderReady(
        'order',
        tx as unknown as Prisma.TransactionClient,
      ),
    ).rejects.toThrow();
    expect(repository.createOrderReady).not.toHaveBeenCalled();
  });
});
