import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { SimulatedPaymentsController } from '../controllers/simulated-payments.controller.js';
import { SimulatedPaymentsRepository } from '../repositories/simulated-payments.repository.js';
import { SimulatedPaymentsService } from './simulated-payments.service.js';
import { TestCardGateway } from './test-card-gateway.js';

vi.mock('../repositories/simulated-payments.repository.js', () => ({
  SimulatedPaymentsRepository: class {},
}));
vi.mock('@Users/services', () => ({ UsersService: class {} }));

const customerId = '10000000-0000-4000-8000-000000000001';
const orderId = '20000000-0000-4000-8000-000000000001';
const input = { orderId, cardToken: 'test_4242' };
const approved = { approved: true, last4: '4242', reason: null };
const result = {
  id: 'payment',
  orderId,
  status: 'APROBADO',
  amount: '17.00',
  last4: '4242',
  reason: null,
  receipt: {
    id: 'receipt',
    number: 'NV-test',
    amount: '17.00',
    issuedAt: '2026-11-06T12:00:00.000Z',
  },
};

describe('BE-06: simulación con JWT real y persistencia simulada', () => {
  const repository = { requirePayable: vi.fn(), record: vi.fn() };
  const users = { findById: vi.fn() };
  const gateway = { authorize: vi.fn() };
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') });
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SimulatedPaymentsController],
      providers: [
        SimulatedPaymentsService,
        { provide: SimulatedPaymentsRepository, useValue: repository },
        { provide: TestCardGateway, useValue: gateway },
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
    repository.requirePayable.mockResolvedValue(undefined);
    gateway.authorize.mockResolvedValue(approved);
    repository.record.mockResolvedValue(result);
  });
  afterAll(async () => {
    await app.close();
  });
  function post(body: object | string = input, auth = token) {
    return request(app.getHttpServer())
      .post('/api/v1/payments/simulate')
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  }

  it('responde 201 con comprobante al aprobar y obtiene el propietario de la sesión', async () => {
    await post().expect(201, result);
    expect(repository.requirePayable).toHaveBeenCalledWith(orderId, customerId);
    expect(repository.record).toHaveBeenCalledWith(
      orderId,
      customerId,
      approved,
    );
    expect(repository.record.mock.invocationCallOrder[0]).toBeGreaterThan(
      gateway.authorize.mock.invocationCallOrder[0],
    );
  });
  it('registra rechazo con 201, motivo y sin comprobante', async () => {
    const decision = { approved: false, last4: '0002', reason: 'Rechazada' };
    gateway.authorize.mockResolvedValue(decision);
    repository.record.mockResolvedValue({
      ...result,
      status: 'RECHAZADO',
      last4: '0002',
      reason: 'Rechazada',
      receipt: null,
    });
    const response = await post({ orderId, cardToken: 'test_0002' }).expect(
      201,
    );
    expect(response.body).toMatchObject({
      status: 'RECHAZADO',
      receipt: null,
      reason: 'Rechazada',
    });
    expect(repository.record).toHaveBeenCalledWith(
      orderId,
      customerId,
      decision,
    );
  });
  it.each([
    new ConflictException('Ya pagado'),
    new ForbiddenException('Ajeno'),
    new NotFoundException('No existe'),
  ])('no llama al simulador cuando no se puede pagar %#', async (error) => {
    repository.requirePayable.mockRejectedValue(error);
    await post().expect(error.getStatus());
    expect(gateway.authorize).not.toHaveBeenCalled();
    expect(repository.record).not.toHaveBeenCalled();
  });
  it('propaga el conflicto detectado al persistir después de una autorización concurrente', async () => {
    repository.record.mockRejectedValue(new ConflictException('Ya pagado'));
    await post().expect(409);
  });
  it('requiere sesión válida', async () => {
    await post(input, 'invalid').expect(401);
  });
  it('rechaza al personal', async () => {
    users.findById.mockResolvedValue({
      id: customerId,
      role: 'COOK',
      isActive: true,
    });
    await post().expect(403);
    expect(gateway.authorize).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, orderId: 'invalid' },
    { ...input, cardToken: '4242' },
    { ...input, cardToken: '4111111111114242' },
    { ...input, cardToken: 'unknown' },
    { ...input, amount: '0.01' },
    { ...input, userId: customerId },
    { ...input, cvv: '123' },
    { ...input, cardNumber: '4111111111114242' },
    { orderId },
  ])(
    'rechaza datos inválidos, PAN/CVV y campos adicionales %#',
    async (body) => {
      await post(body).expect(400);
      expect(gateway.authorize).not.toHaveBeenCalled();
      expect(repository.record).not.toHaveBeenCalled();
    },
  );
});

describe('TestCardGateway', () => {
  it('espera dos segundos y produce las decisiones de los tokens de prueba', async () => {
    const gateway = new TestCardGateway();
    const start = performance.now();
    const results = await Promise.all([
      gateway.authorize('test_4242'),
      gateway.authorize('test_0002'),
    ]);
    expect(performance.now() - start).toBeGreaterThanOrEqual(1950);
    expect(results).toEqual([
      { approved: true, last4: '4242', reason: null },
      {
        approved: false,
        last4: '0002',
        reason: 'La tarjeta de prueba fue rechazada.',
      },
    ]);
  });
});
