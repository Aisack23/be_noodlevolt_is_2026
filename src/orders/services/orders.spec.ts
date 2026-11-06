import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ForbiddenException, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { OrdersController } from '../controllers/orders.controller.js';
import { OrdersRepository } from '../repositories/orders.repository.js';
import { OrdersService } from './orders.service.js';
import { normalizeOrder, orderRequestHash } from './order-request.js';

vi.mock('../repositories/orders.repository.js', () => ({
  OrdersRepository: class {},
}));
vi.mock('@Users/services', () => ({ UsersService: class {} }));

const customerId = '10000000-0000-4000-8000-000000000001';
const input = {
  branchId: '20000000-0000-4000-8000-000000000001',
  operationKey: '30000000-0000-4000-8000-000000000001',
  lines: [{ dishId: 'aaaaaaaa-0000-4000-8000-000000000001', quantity: 2 }],
};
const order = {
  id: 'order',
  branchId: input.branchId,
  operationKey: input.operationKey,
  status: 'PENDING',
  total: '17.00',
  lines: [],
};

describe('BE-02: pedidos', () => {
  const repository = { create: vi.fn() };
  const users = { findById: vi.fn() };
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') });
  let app: INestApplication;
  let service: OrdersService;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        OrdersService,
        { provide: OrdersRepository, useValue: repository },
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
    service = module.get(OrdersService);
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
    token = await jwt.signAsync({ sub: customerId });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue({
      id: customerId,
      role: 'CLIENT',
      isActive: true,
    });
    repository.create.mockResolvedValue({ created: true, order });
  });
  afterAll(async () => {
    await app.close();
  });

  function post(body: unknown = input) {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  it('crea con 201 y usa la identidad verificada por el guard', async () => {
    await post().expect(201, order);
    expect(repository.create).toHaveBeenCalledWith(
      customerId,
      input,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
  it('devuelve 200 en un reintento identificado por persistencia', async () => {
    repository.create.mockResolvedValue({ created: false, order });
    await post().expect(200, order);
  });
  it('rechaza la solicitud sin sesión', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send(input)
      .expect(401);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('rechaza token inválido', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', 'Bearer invalid')
      .send(input)
      .expect(401);
  });
  it('rechaza token vencido', async () => {
    const expired = await jwt.signAsync({ sub: customerId }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${expired}`)
      .send(input)
      .expect(401);
  });
  it('rechaza al personal aunque tenga JWT válido', async () => {
    users.findById.mockResolvedValue({
      id: customerId,
      role: 'BRANCH_ADMIN',
      isActive: true,
    });
    await post().expect(403);
    expect(repository.create).not.toHaveBeenCalled();
  });
  it('aplica permiso también cuando se invoca directamente el servicio', async () => {
    expect(() =>
      service.create({ id: customerId, role: 'COOK' }, input),
    ).toThrow(ForbiddenException);
  });
  it.each([
    { ...input, userId: customerId },
    { ...input, total: '0.01' },
    { ...input, lines: [] },
    { ...input, operationKey: 'invalid' },
    { ...input, lines: [{ ...input.lines[0], quantity: 0 }] },
    { ...input, lines: [{ ...input.lines[0], quantity: 21 }] },
    { ...input, lines: [{ ...input.lines[0], quantity: 1.5 }] },
    { ...input, lines: [{ ...input.lines[0], quantity: '2' }] },
    { ...input, lines: [{ ...input.lines[0], price: '0.01' }] },
    { ...input, lines: [null] },
    { ...input, lines: [input.lines[0], input.lines[0]] },
    {
      ...input,
      lines: [
        input.lines[0],
        { ...input.lines[0], dishId: input.lines[0].dishId.toUpperCase() },
      ],
    },
    { ...input, lines: Array.from({ length: 101 }, () => input.lines[0]) },
  ])(
    'rechaza entradas inválidas o campos que intentan sobrescribir datos del servidor %#',
    async (body) => {
      await post(body).expect(400);
      expect(repository.create).not.toHaveBeenCalled();
    },
  );
  it('normaliza orden de líneas y UUID antes de calcular la huella de idempotencia', () => {
    const first = normalizeOrder({
      ...input,
      lines: [
        ...input.lines,
        { dishId: 'bbbbbbbb-0000-4000-8000-000000000001', quantity: 1 },
      ],
    });
    const second = normalizeOrder({
      ...input,
      lines: [...first.lines]
        .reverse()
        .map((line) => ({ ...line, dishId: line.dishId.toUpperCase() })),
    });
    expect(orderRequestHash(customerId, first)).toBe(
      orderRequestHash(customerId, second),
    );
    expect(orderRequestHash(customerId, first)).not.toBe(
      orderRequestHash('other', first),
    );
    expect(orderRequestHash(customerId, first)).not.toBe(
      orderRequestHash(customerId, { ...first, lines: input.lines }),
    );
  });
});
