/**
 * Validación de variables de entorno.
 *
 * Se ejecuta durante el arranque de ConfigModule: si falta algo o tiene un
 * valor inválido, la aplicación falla de inmediato con un mensaje claro en
 * lugar de reventar más tarde con un error críptico en la primera request.
 */

import { parseCidrs, parseOrigins } from '../security/network-policy.js';

export interface EnvConfig {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN_DAYS: number;
  BCRYPT_SALT_ROUNDS: number;
  CORS_ORIGINS: string[];
  TRUSTED_PROXY_CIDRS: string[];
  IP_ALLOWLIST: string[];
  RATE_LIMIT_GLOBAL: number;
  RATE_LIMIT_LOGIN_IP: number;
  RATE_LIMIT_LOGIN_ACCOUNT: number;
  RATE_LIMIT_REGISTER: number;
  RATE_LIMIT_REFRESH: number;
  RATE_LIMIT_WRITES: number;
  SWAGGER_ENABLED: boolean;
  ALLOW_DEMO_SEED: boolean;
}

const requiredVars = ['DATABASE_URL', 'JWT_SECRET'] as const;

/**
 * Lee una variable como string. process.env siempre entrega strings, pero el
 * objeto llega tipado como `unknown`, así que se valida en vez de castear.
 */
function readString(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const value = raw[key];
  if (value === undefined || value === '') return fallback;

  if (typeof value !== 'string') {
    throw new Error(`La variable de entorno ${key} debe ser un string.`);
  }
  return value;
}

function readInt(
  raw: Record<string, unknown>,
  key: string,
  fallback: number,
  min = 1,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const value = raw[key];
  if (value === undefined || value === '') return fallback;

  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && !/^\d+$/.test(value))
  ) {
    throw new Error(
      `La variable de entorno ${key} debe ser un entero entre ${min} y ${max}.`,
    );
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `La variable de entorno ${key} debe ser un entero entre ${min} y ${max}.`,
    );
  }
  return parsed;
}

function readBoolean(
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  if (raw[key] === undefined || raw[key] === '') return fallback;
  if (raw[key] !== 'true' && raw[key] !== 'false')
    throw new Error(`${key} debe ser true o false.`);
  return raw[key] === 'true';
}

function accessTokenTtl(raw: Record<string, unknown>): string {
  const value = readString(raw, 'JWT_EXPIRES_IN', '15m');
  const match = /^(\d+)(s|m)$/.exec(value);
  const seconds = match ? Number(match[1]) * (match[2] === 'm' ? 60 : 1) : NaN;
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 900)
    throw new Error(
      'JWT_EXPIRES_IN debe incluir s o m y representar entre 60 y 900 segundos.',
    );
  return value;
}

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const missing = requiredVars.filter((key) => !raw[key]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno obligatorias: ${missing.join(', ')}. ` +
        'Proporciónalas mediante variables del servidor; en desarrollo puedes usar .env.',
    );
  }

  const jwtSecret = readString(raw, 'JWT_SECRET', '');
  if (
    Buffer.byteLength(jwtSecret, 'utf8') < 32 ||
    new Set(jwtSecret).size < 8 ||
    /cambiame|changeme|placeholder|change[-_ ]?me|your[-_ ]?secret/i.test(
      jwtSecret,
    )
  ) {
    throw new Error(
      'JWT_SECRET debe ser aleatorio, tener al menos 32 bytes y no utilizar valores de ejemplo. Genéralo con openssl rand -base64 32.',
    );
  }

  const mode = readString(raw, 'NODE_ENV', 'development');
  if (!['development', 'test', 'production'].includes(mode))
    throw new Error('NODE_ENV debe ser development, test o production.');
  const nodeEnv = mode as EnvConfig['NODE_ENV'];
  const databaseUrl = readString(raw, 'DATABASE_URL', '');
  try {
    const url = new URL(databaseUrl);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error('URL inválida');
    if (
      nodeEnv === 'production' &&
      (['postgres', 'password', 'changeme', 'placeholder', ''].includes(
        decodeURIComponent(url.password).toLowerCase(),
      ) ||
        url.searchParams.getAll('sslmode').length !== 1 ||
        url.searchParams.get('sslmode') !== 'verify-full' ||
        ['ssl', 'host', 'port', 'user', 'password'].some((key) =>
          url.searchParams.has(key),
        ) ||
        raw.NODE_TLS_REJECT_UNAUTHORIZED === '0')
    )
      throw new Error('Credenciales o TLS inseguros');
  } catch {
    throw new Error(
      'DATABASE_URL debe ser una URL PostgreSQL válida; producción requiere una contraseña propia y sslmode=verify-full.',
    );
  }
  const origins = parseOrigins(raw.CORS_ORIGINS);
  if (
    nodeEnv === 'production' &&
    origins.some((origin) => new URL(origin).protocol !== 'https:')
  )
    throw new Error('CORS_ORIGINS requiere HTTPS en producción.');

  return {
    NODE_ENV: nodeEnv,
    PORT: readInt(raw, 'PORT', 3000, 1, 65535),
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    JWT_EXPIRES_IN: accessTokenTtl(raw),
    REFRESH_TOKEN_EXPIRES_IN_DAYS: readInt(
      raw,
      'REFRESH_TOKEN_EXPIRES_IN_DAYS',
      7,
      1,
      30,
    ),
    BCRYPT_SALT_ROUNDS: readInt(raw, 'BCRYPT_SALT_ROUNDS', 12, 10, 14),
    CORS_ORIGINS: origins,
    TRUSTED_PROXY_CIDRS: parseCidrs(raw.TRUSTED_PROXY_CIDRS, true),
    IP_ALLOWLIST: parseCidrs(raw.IP_ALLOWLIST),
    RATE_LIMIT_GLOBAL: readInt(raw, 'RATE_LIMIT_GLOBAL', 300, 1, 10000),
    RATE_LIMIT_LOGIN_IP: readInt(raw, 'RATE_LIMIT_LOGIN_IP', 10, 1, 100),
    RATE_LIMIT_LOGIN_ACCOUNT: readInt(
      raw,
      'RATE_LIMIT_LOGIN_ACCOUNT',
      30,
      1,
      300,
    ),
    RATE_LIMIT_REGISTER: readInt(raw, 'RATE_LIMIT_REGISTER', 10, 1, 100),
    RATE_LIMIT_REFRESH: readInt(raw, 'RATE_LIMIT_REFRESH', 30, 1, 300),
    RATE_LIMIT_WRITES: readInt(raw, 'RATE_LIMIT_WRITES', 60, 1, 1000),
    SWAGGER_ENABLED: readBoolean(
      raw,
      'SWAGGER_ENABLED',
      nodeEnv !== 'production',
    ),
    ALLOW_DEMO_SEED: readBoolean(raw, 'ALLOW_DEMO_SEED', false),
  };
}
