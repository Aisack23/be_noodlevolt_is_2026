//hace que los usuers sin sucursal tengan branch id null

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { User } from '@PrismaClient';
import type { EnvConfig } from '@Config';
import type { RefreshTokenRepository } from '@Auth/repositories';
import { TokenService } from './token.service.js';

describe('TokenService - claims de rol y sucursal', () => {
  const branchId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000001';

  const signAsync = vi.fn();
  const verifyAsync = vi.fn();
  const createRefreshToken = vi.fn();

  let service: TokenService;

  beforeEach(() => {
    vi.clearAllMocks();

    signAsync.mockResolvedValue('access-token-firmado');

    verifyAsync.mockResolvedValue({
      iat: 1000,
      exp: 1900,
    });

    createRefreshToken.mockResolvedValue(undefined);

    const jwtService = {
      signAsync,
      verifyAsync,
    } as unknown as JwtService;

    const repository = {
      create: createRefreshToken,
    } as unknown as RefreshTokenRepository;

    const configService = {
      get: vi.fn().mockReturnValue(7),
    } as unknown as ConfigService<EnvConfig, true>;

    service = new TokenService(
      repository,
      jwtService,
      configService,
    );
  });

  it('incluye rol y sucursal de un empleado', async () => {
    const user = {
      id: userId,
      email: 'mesero@noodlevolt.com',
      role: 'WAITER',
      branchId,
      isActive: true,
    } as User;

    const tokens = await service.issueTokenPair(user);

    expect(signAsync).toHaveBeenCalledWith({
      sub: userId,
      email: 'mesero@noodlevolt.com',
      role: 'WAITER',
      branchId,
    });

    expect(tokens.accessToken).toBe(
      'access-token-firmado',
    );

    expect(tokens.expiresIn).toBe(900);

    expect(createRefreshToken).toHaveBeenCalledOnce();

    expect(createRefreshToken).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: expect.any(Date),
      }),
    );
  });

  it('mantiene branchId null para un cliente', async () => {
    const user = {
      id: userId,
      email: 'cliente@noodlevolt.com',
      role: 'CLIENT',
      branchId: null,
      isActive: true,
    } as User;

    await service.issueTokenPair(user);

    expect(signAsync).toHaveBeenCalledWith({
      sub: userId,
      email: 'cliente@noodlevolt.com',
      role: 'CLIENT',
      branchId: null,
    });
  });

  it('conserva rol general sin sucursal', async () => {
    const user = {
      id: userId,
      email: 'gerencia@noodlevolt.com',
      role: 'GENERAL_MANAGER',
      branchId: null,
      isActive: true,
    } as User;

    await service.issueTokenPair(user);

    expect(signAsync).toHaveBeenCalledWith({
      sub: userId,
      email: 'gerencia@noodlevolt.com',
      role: 'GENERAL_MANAGER',
      branchId: null,
    });
  });
});
