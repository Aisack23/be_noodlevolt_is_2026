import { Test } from '@nestjs/testing';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { JwtAuthGuard } from '@Auth/guards';
import type { UsersService } from '@Users/services';
import { BranchesQueryController } from '../controllers/branches-query.controller.js';
import { BranchesQueryService } from './branches-query.service.js';
import { BranchRepository } from '../repositories/branch.repository.js';

vi.mock('../repositories/branch.repository.js', () => ({
  BranchRepository: class {},
}));
vi.mock('@Users/services', () => ({ UsersService: class {} }));

const id = '10000000-0000-4000-8000-000000000001';
const branch = {
  id,
  name: 'Centro',
  address: 'San Salvador',
  timeZone: 'America/El_Salvador',
  isActive: true,
  config: { isOpen: true },
  updatedBy: 'private',
};
const response = {
  id,
  name: 'Centro',
  address: 'San Salvador',
  timeZone: 'America/El_Salvador',
  isActive: true,
  isOpen: true,
};

describe('Consultas públicas de sucursales', () => {
  const repository = { findPublicBranches: vi.fn(), findPublicBranch: vi.fn() };
  const users = { findById: vi.fn() };
  let app: INestApplication;
  let service: BranchesQueryService;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BranchesQueryController],
      providers: [
        BranchesQueryService,
        { provide: BranchRepository, useValue: repository },
        {
          provide: APP_GUARD,
          useValue: new JwtAuthGuard(
            new Reflector(),
            new JwtService(),
            users as unknown as UsersService,
          ),
        },
      ],
    }).compile();
    service = module.get(BranchesQueryService);
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    repository.findPublicBranches.mockResolvedValue([branch]);
    repository.findPublicBranch.mockResolvedValue(branch);
  });
  afterAll(async () => {
    await app.close();
  });

  it('lista sin sesión y sin exponer configuración ni auditoría', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .expect(200, [response]);
    expect(users.findById).not.toHaveBeenCalled();
  });
  it('permite consultar con Bearer inválido porque el listado es público', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/branches')
      .set('Authorization', 'Bearer invalid')
      .expect(200, [response]);
  });
  it('devuelve [] sin registros', async () => {
    repository.findPublicBranches.mockResolvedValue([]);
    await request(app.getHttpServer()).get('/api/v1/branches').expect(200, []);
  });
  it('consulta detalle con UUID y Bearer inválido sin requerir sesión', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${id}`)
      .set('Authorization', 'Bearer invalid')
      .expect(200, response);
    expect(repository.findPublicBranch).toHaveBeenCalledWith(id);
  });
  it.each(['invalid', '123'])(
    'rechaza ID inválido %s antes de acceder al repositorio',
    async (value) => {
      await request(app.getHttpServer())
        .get(`/api/v1/branches/${value}`)
        .expect(400);
      expect(repository.findPublicBranch).not.toHaveBeenCalled();
    },
  );
  it('responde 404 para UUID inexistente', async () => {
    repository.findPublicBranch.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get(`/api/v1/branches/${id}`)
      .expect(404);
    await expect(service.find(id)).rejects.toBeInstanceOf(NotFoundException);
  });
  it.each([
    { isActive: true, config: { isOpen: false } },
    { isActive: false, config: { isOpen: true } },
    { isActive: true, config: null },
  ])('cierra efectivamente la sucursal con estado %j', async (state) => {
    repository.findPublicBranches.mockResolvedValue([{ ...branch, ...state }]);
    repository.findPublicBranch.mockResolvedValue({ ...branch, ...state });
    expect((await service.list())[0].isOpen).toBe(false);
    expect((await service.find(id)).isOpen).toBe(false);
  });
  it('propaga los errores de persistencia', async () => {
    const error = new Error('Database unavailable');
    repository.findPublicBranches.mockRejectedValue(error);
    await expect(service.list()).rejects.toBe(error);
  });
  it('documenta listado y detalle en Swagger', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(
      document.paths['/api/v1/branches'].get?.responses['200'],
    ).toBeDefined();
    expect(
      document.paths['/api/v1/branches/{id}'].get?.responses['404'],
    ).toBeDefined();
  });
});
