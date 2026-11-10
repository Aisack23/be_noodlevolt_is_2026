import { randomBytes } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { JwtAuthGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { ReservationBookingController } from '../controllers/reservation-booking.controller.js';
import { ReservationBookingRepository } from '../repositories/reservation-booking.repository.js';
import { ReservationBookingService } from './reservation-booking.service.js';

vi.mock('../repositories/reservation-booking.repository.js', () => ({
  ReservationBookingRepository: class {},
}));
vi.mock('@Users/services', () => ({ UsersService: class {} }));
const userId = '10000000-0000-4000-8000-000000000001';
const payload = () => ({
  branchId: '20000000-0000-4000-8000-000000000001',
  startsAt: new Date(Date.now() + 86400000).toISOString(),
  guests: 4,
  contactName: 'Isaac',
  phone: '+50370000000',
});

describe('BE-04: HTTP, sesión y validaciones', () => {
  const repository = { book: vi.fn() };
  const users = { findById: vi.fn() };
  const jwt = new JwtService({ secret: randomBytes(32).toString('hex') });
  let app: INestApplication;
  let token: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReservationBookingController],
      providers: [
        ReservationBookingService,
        { provide: ReservationBookingRepository, useValue: repository },
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
    token = await jwt.signAsync({ sub: userId });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    users.findById.mockResolvedValue({
      id: userId,
      role: 'CLIENT',
      isActive: true,
    });
    repository.book.mockResolvedValue({
      id: 'reservation',
      status: 'CONFIRMED',
    });
  });
  afterAll(async () => {
    await app.close();
  });
  function post(body: object) {
    return request(app.getHttpServer())
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }
  it('responde 201 y construye intervalo de 90 minutos para el usuario de sesión', async () => {
    const body = payload();
    await post(body).expect(201);
    const args = repository.book.mock.calls[0];
    expect(args[0]).toBe(userId);
    expect(args[2]).toEqual(new Date(body.startsAt));
    expect(args[3].getTime() - args[2].getTime()).toBe(90 * 60000);
  });
  it('rechaza falta de sesión', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reservations')
      .send(payload())
      .expect(401);
  });
  it('rechaza rol distinto de cliente sin consultar datos', async () => {
    users.findById.mockResolvedValue({
      id: userId,
      role: 'COOK',
      isActive: true,
    });
    await post(payload()).expect(403);
    expect(repository.book).not.toHaveBeenCalled();
  });
  it.each([
    { startsAt: '2000-01-01T10:00:00Z' },
    { startsAt: '2027-02-30T12:00:00Z' },
    { startsAt: '2030-01-01T12:00:00' },
    { startsAt: 'invalid' },
    { guests: 0 },
    { guests: -1 },
    { guests: 1.5 },
    { guests: '4' },
    { contactName: '   ' },
    { phone: 'abc' },
    { phone: '       ' },
    { branchId: 'invalid' },
    { userId },
    { tableId: userId },
    { endsAt: '2030-01-01T14:00:00Z' },
    { status: 'CONFIRMED' },
  ])(
    'rechaza datos inválidos o intentos de asignar propietario/mesa/estado %#',
    async (invalid) => {
      await post({ ...payload(), ...invalid }).expect(400);
      expect(repository.book).not.toHaveBeenCalled();
    },
  );
  it('acepta offset horario explícito y respeta su instante UTC', async () => {
    await post({ ...payload(), startsAt: '2030-01-01T12:00:00-06:00' }).expect(
      201,
    );
    expect(repository.book.mock.calls[0][2].toISOString()).toBe(
      '2030-01-01T18:00:00.000Z',
    );
  });
});
