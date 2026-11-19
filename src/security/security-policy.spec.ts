import { randomBytes } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import bcrypt from 'bcrypt';
import type { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@Config';
import { validateEnv } from '../config/env.validation.js';
import { parseCidrs, parseOrigins, isAllowedIp } from './network-policy.js';
import { CreateUserDto } from '../users/dto/create-user.dto.js';
import { LoginDto } from '../auth/dto/login.dto.js';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto.js';
import { UsersService } from '../users/services/users.service.js';
import type { UserRepository } from '../users/repositories/user.repository.js';
import { seedBaseData } from '../../prisma/seeds/base-data.js';
import type { PrismaClient } from '@PrismaClient';

describe('Configuración segura y límites criptográficos', () => {
  const secret = randomBytes(32).toString('base64');
  const base = {
    JWT_SECRET: secret,
    DATABASE_URL:
      'postgresql://app:private-test-value@database/noodlevolt?sslmode=verify-full',
    NODE_ENV: 'production',
  };
  it('acepta secretos externos y políticas restrictivas por defecto', () => {
    expect(validateEnv(base)).toMatchObject({
      NODE_ENV: 'production',
      CORS_ORIGINS: [],
      TRUSTED_PROXY_CIDRS: [],
      IP_ALLOWLIST: [],
      JWT_EXPIRES_IN: '15m',
      BCRYPT_SALT_ROUNDS: 12,
      SWAGGER_ENABLED: false,
    });
  });
  it.each([
    '',
    'short',
    'a'.repeat(64),
    'cambiame-por-un-secreto-largo-y-aleatorio',
  ])('rechaza secretos débiles o de ejemplo %#', (JWT_SECRET) => {
    expect(() => validateEnv({ ...base, JWT_SECRET })).toThrow();
  });
  it.each(['1y', '1h', '901s', '0m', '15', '999999999999999m'])(
    'rechaza vigencia JWT %s',
    (JWT_EXPIRES_IN) => {
      expect(() => validateEnv({ ...base, JWT_EXPIRES_IN })).toThrow(
        /JWT_EXPIRES_IN/,
      );
    },
  );
  it.each([1, 4, 9, 15, 31, true])(
    'rechaza factor bcrypt %s',
    (BCRYPT_SALT_ROUNDS) => {
      expect(() => validateEnv({ ...base, BCRYPT_SALT_ROUNDS })).toThrow(
        /BCRYPT_SALT_ROUNDS/,
      );
    },
  );
  it.each([
    { REFRESH_TOKEN_EXPIRES_IN_DAYS: 31 },
    { RATE_LIMIT_GLOBAL: 0 },
    { RATE_LIMIT_LOGIN_IP: -1 },
    { RATE_LIMIT_GLOBAL: [] },
    { PORT: 65536 },
    { SWAGGER_ENABLED: 'yes' },
    { NODE_ENV: 'prod' },
  ])('rechaza políticas inválidas %#', (override) => {
    expect(() => validateEnv({ ...base, ...override })).toThrow();
  });
  it.each([
    'postgresql://app:private-test-value@database/noodlevolt',
    'postgresql://app:private-test-value@database/noodlevolt?sslmode=require',
    'postgresql://app:postgres@database/noodlevolt?sslmode=verify-full',
    'http://database/noodlevolt',
    'postgresql://app:private-test-value@database/noodlevolt?sslmode=verify-full&sslmode=no-verify',
    'postgresql://app:private-test-value@database/noodlevolt?sslmode=verify-full&ssl=false',
  ])(
    'rechaza credenciales o transporte PostgreSQL inseguros %#',
    (DATABASE_URL) => {
      expect(() => validateEnv({ ...base, DATABASE_URL })).toThrow(
        /DATABASE_URL/,
      );
    },
  );
  it('no revela el secreto al informar una URL inválida', () => {
    const credential = randomBytes(20).toString('hex');
    let captured: unknown;
    try {
      validateEnv({ ...base, DATABASE_URL: `invalid-${credential}` });
    } catch (error) {
      captured = error;
    }
    expect(captured).toBeInstanceOf(Error);
    expect(String(captured)).not.toContain(credential);
  });
  it('rechaza deshabilitar globalmente la verificación de certificados en producción', () => {
    expect(() =>
      validateEnv({ ...base, NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    ).toThrow(/DATABASE_URL/);
  });
  it.each([
    '*',
    'https://*.example.com',
    'https://trusted.example/path',
    'https://user:password@example.com',
    'null',
  ])('rechaza origen CORS %s', (origin) => {
    expect(() => parseOrigins(origin)).toThrow();
  });
  it('permite solo orígenes exactos y HTTPS en producción', () => {
    expect(
      parseOrigins('https://Trusted.example/,https://trusted.example'),
    ).toEqual(['https://trusted.example']);
    expect(() =>
      validateEnv({ ...base, CORS_ORIGINS: 'http://frontend.example' }),
    ).toThrow();
  });
  it.each(['true', '*', '0.0.0.0/0', '::/0', '127.0.0.1/99'])(
    'rechaza proxies no confiables %s',
    (value) => {
      expect(() => parseCidrs(value, true)).toThrow();
    },
  );
  it('aplica CIDR a IPv4, IPv6 e IPv4 mapeada, sin aceptar direcciones arbitrarias', () => {
    const allowed = parseCidrs('192.0.2.0/24,2001:db8:1234::/48');
    expect(isAllowedIp('192.0.2.50', allowed)).toBe(true);
    expect(isAllowedIp('::ffff:192.0.2.50', allowed)).toBe(true);
    expect(isAllowedIp('2001:db8:1234::5', allowed)).toBe(true);
    expect(isAllowedIp('192.0.3.50', allowed)).toBe(false);
    expect(isAllowedIp('invalid', allowed)).toBe(false);
  });
  it('rechaza contraseñas multibyte que bcrypt truncaría', async () => {
    const password = 'Aa1' + 'é'.repeat(35);
    expect(password.length).toBeLessThan(72);
    expect(Buffer.byteLength(password)).toBeGreaterThan(72);
    const signup = plainToInstance(CreateUserDto, {
      name: 'Cliente',
      lastName: 'Prueba',
      email: 'test@example.com',
      password,
    });
    const login = plainToInstance(LoginDto, {
      email: 'test@example.com',
      password,
    });
    expect(
      (await validate(signup)).some((error) => error.property === 'password'),
    ).toBe(true);
    expect(
      (await validate(login)).some((error) => error.property === 'password'),
    ).toBe(true);
  });
  it('acepta exactamente 72 bytes y rechaza el exceso también en el servicio', async () => {
    const service = new UsersService(
      {} as UserRepository,
      { get: () => 10 } as unknown as ConfigService<EnvConfig, true>,
    );
    const password = 'Aa1' + 'x'.repeat(69);
    const first = await service.hashPassword(password);
    const second = await service.hashPassword(password);
    expect(first).not.toBe(second);
    expect(bcrypt.getRounds(first)).toBe(10);
    expect(await service.verifyPassword(password, first)).toBe(true);
    expect(() => service.hashPassword(password + 'x')).toThrow();
  });
  it.each(['', 'short', 'a'.repeat(65), 'A'.repeat(64)])(
    'rechaza refresh token malformado %#',
    async (refreshToken) => {
      expect(
        await validate(plainToInstance(RefreshTokenDto, { refreshToken })),
      ).not.toHaveLength(0);
    },
  );
  it('bloquea los usuarios demo en producción si no se pide explícitamente', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(seedBaseData({} as PrismaClient)).rejects.toThrow(
        /ALLOW_DEMO_SEED/,
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('exige DEMO_SEED_PASSWORD aunque ALLOW_DEMO_SEED esté activo en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEMO_SEED', 'true');
    vi.stubEnv('DEMO_SEED_PASSWORD', '');
    const prisma = { $transaction: vi.fn() };
    try {
      await expect(
        seedBaseData(prisma as unknown as PrismaClient),
      ).rejects.toThrow(/DEMO_SEED_PASSWORD/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('crea los datos demo en producción solo con ALLOW_DEMO_SEED=true y contraseña', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOW_DEMO_SEED', 'true');
    vi.stubEnv('DEMO_SEED_PASSWORD', 'Demo-Entrega-2026!');
    const prisma = { $transaction: vi.fn() };
    try {
      await seedBaseData(prisma as unknown as PrismaClient);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.each(['yes', 'TRUE', '1'])(
    'rechaza ALLOW_DEMO_SEED=%s porque no es un booleano estricto',
    (ALLOW_DEMO_SEED) => {
      expect(() => validateEnv({ ...base, ALLOW_DEMO_SEED })).toThrow(
        /ALLOW_DEMO_SEED/,
      );
    },
  );
  it('deja ALLOW_DEMO_SEED desactivado por defecto', () => {
    expect(validateEnv(base).ALLOW_DEMO_SEED).toBe(false);
  });
});
