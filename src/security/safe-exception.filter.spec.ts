import { randomBytes, randomUUID } from 'node:crypto';
import { ConflictException, Logger, type ArgumentsHost } from '@nestjs/common';
import { SafeExceptionFilter } from './safe-exception.filter.js';
import { MenuService } from '../catalog/menu/services/menu.service.js';
import type { MenuRepository } from '../catalog/menu/repositories/menu.repository.js';

describe('Errores de producción sin datos sensibles', () => {
  it('no registra mensajes secretos del verificador de insumos', async () => {
    const secret = randomBytes(24).toString('hex');
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const repository = {
      findByBranchId: async () => ({
        branch: { id: randomUUID(), name: 'Demo' },
        dishes: [],
      }),
    } as unknown as MenuRepository;
    const service = new MenuService(repository, {
      findSufficientDishIds: () => Promise.reject(new Error(secret)),
    });
    await service.getMenu(randomUUID());
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(secret);
  });
  const secret = randomBytes(24).toString('hex');
  const response = {
    headersSent: false,
    status: vi.fn(),
    json: vi.fn(),
    getHeader: vi.fn(),
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  const filter = new SafeExceptionFilter();
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    response.headersSent = false;
    response.status.mockReturnValue(response);
    response.getHeader.mockReturnValue(randomUUID());
    log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('oculta mensaje y stack internos tanto al cliente como al log', () => {
    filter.catch(new Error(`Database connection password=${secret}`), host);
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(log.mock.calls)).not.toContain('Database connection');
  });
  it('conserva conflictos de negocio y su contrato público', () => {
    filter.catch(
      new ConflictException({
        message: 'El precio cambió.',
        prices: [{ currentPrice: '8.50' }],
      }),
      host,
    );
    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith({
      message: 'El precio cambió.',
      prices: [{ currentPrice: '8.50' }],
    });
    expect(log).not.toHaveBeenCalled();
  });
  it.each([
    ['entity.parse.failed', 400],
    ['entity.too.large', 413],
    ['parameters.too.many', 413],
    ['encoding.unsupported', 415],
    ['charset.unsupported', 415],
  ] as const)('oculta el cuerpo rechazado en %s', (type, status) => {
    filter.catch({ type, body: secret }, host);
    expect(response.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(response.json.mock.calls)).not.toContain(secret);
  });
  it('no escribe dos veces una respuesta enviada', () => {
    response.headersSent = true;
    filter.catch(new Error(secret), host);
    expect(response.json).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
});
