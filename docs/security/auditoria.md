# Auditoría de seguridad del backend NoodleVolt

Fecha: 14 de noviembre de 2026 (El Salvador). Base: `c11f843`; rama: `security/backend-hardening`. Se revisa el snapshot indicado y las correcciones de esta rama. Cada hallazgo incluye el fragmento original y archivos corregidos completos; los enlaces permiten revisar la integración, configuración y pruebas de la rama.

## Resultado por los nueve puntos

| Punto                     | Resultado observado y cambio                                                                                                                                                                                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Rate limiting          | Ausente inicialmente. Cuotas compartidas por PostgreSQL, globales y de login/registro/refresh/escrituras; 429 y Retry-After verificados.                                                                                                                                                             |
| 2. Secretos en código     | No se identificó una clave productiva real en los archivos versionados revisados. Se retiró el password demo fijo y se rechazaron valores de ejemplo. Las credenciales de CI son de un contenedor desechable.                                                                                        |
| 3. Secretos de producción | Variables externas existentes; se endurece validación, se ignora .env en producción y se redactan errores. No se leyó ni publicó el contenido del .env real.                                                                                                                                         |
| 4. Control por IP         | Se añade CIDR opcional, proxies concretos, bloqueo de IP inválida, normalización IPv4 y agrupación IPv6 /64. XFF no permite evadir cuotas desde un cliente directo.                                                                                                                                  |
| 5. Validación/inyecciones | ValidationPipe y Prisma ya estaban presentes. Se añaden límites de cuerpo, bytes de contraseña y formato de refresh. La búsqueda de runtime no halló SQL Unsafe/eval. Se probaron SQL como datos, objetos de inyección y mass assignment.                                                            |
| 6. RLS/aislamiento        | No hay políticas SQL RLS en las migraciones. El aislamiento es de aplicación: propietario de sesión y roles/sucursal. Las pruebas rechazaron acceso a pedidos, avisos, saldos y sucursales ajenos; los repositorios CRUD internos no son rutas públicas. No se certifica el rol de la DB productiva. |
| 7. Hash/cifrado           | bcrypt con salt ya existía; se corrigen bytes y factor. TLS a PostgreSQL y HTTPS de API se exigen en producción. Cifrado de discos/respaldos y certificados del proveedor requieren verificación de infraestructura.                                                                                 |
| 8. Sesiones               | Refresh aleatorio y hash SHA-256 ya existían. Se corrige rotación concurrente y contrato JWT. Logout revoca refresh; access JWT sigue válido hasta expirar. Esa limitación se conserva y está probada/documentada.                                                                                   |
| 9. CORS                   | Antes estaba deshabilitado: no había comodín y el navegador bloqueaba cross-origin. No se reporta eso como una vulnerabilidad. Ahora hay allowlist exacta, HTTPS en producción, credentials=false y pruebas de preflight/origen adversario.                                                          |

## Hallazgos y soluciones aplicadas

### F01. Sin rate limiting global ni específico

- **Severidad:** Alta.
- **Punto afectado:** 1 y 4.
- **Ubicación:** `src/main.ts:11` en la base `c11f843`.

**Fragmento original:**

```typescript
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService<EnvConfig, true>);

  // Versionado en la URI: /api/v1/...
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
```

**Descripción:** El bootstrap no instalaba cuotas. Login/registro ejecutan trabajo bcrypt y consultas sin frenar intentos por IP o cuenta; las rutas públicas también podían recibir solicitudes repetidas sin cuota. Un límite solo en memoria no habría compartido estado entre réplicas.

**Solución propuesta y aplicada:** Se instala express-rate-limit con un almacén PostgreSQL atómico, HMAC de claves, ventanas por ruta y cuenta normalizada, agrupación IPv6 /64, Retry-After y fallo cerrado. Los proxies solo se confían por CIDR configurado y existe allowlist opcional. La limpieza vuelve a comprobar el vencimiento después de esperar bloqueos para conservar cuotas renovadas; una prueba fuerza esa carrera y detecta al retirar la condición. Las cuotas no sustituyen la protección volumétrica del gateway.

**Archivo corregido: `src/security/http-security.service.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express, { type Express, type RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { PrismaService } from '@Prisma/services';
import type { EnvConfig } from '@Config';
import { isAllowedIp } from './network-policy.js';
import { PostgresRateLimitStore } from './postgres-rate-limit.store.js';
import { SafeExceptionFilter } from './safe-exception.filter.js';

@Injectable()
export class HttpSecurityService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService)
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  install(app: INestApplication): void {
    const api = app.getHttpAdapter().getInstance() as Express;
    const proxies = this.config.get('TRUSTED_PROXY_CIDRS', { infer: true });
    api.set('trust proxy', proxies.length ? proxies : false);
    api.disable('x-powered-by');
    if (this.config.get('NODE_ENV', { infer: true }) === 'production')
      app.useGlobalFilters(new SafeExceptionFilter());
    api.use(helmet({ referrerPolicy: { policy: 'no-referrer' } }));
    api.use((req, res, next) => {
      res.setHeader('X-Request-Id', randomUUID());
      const healthCheck =
        ['GET', 'HEAD'].includes(req.method) &&
        ['/api/v1', '/api/v1/'].includes(req.path);
      if (
        this.config.get('NODE_ENV', { infer: true }) === 'production' &&
        !req.secure &&
        !healthCheck
      ) {
        res
          .status(426)
          .json({ statusCode: 426, message: 'Se requiere HTTPS.' });
        return;
      }
      if (!req.ip || isIP(req.ip) === 0) {
        res.status(400).json({
          statusCode: 400,
          message: 'La dirección de origen no es válida.',
        });
        return;
      }
      if (
        req.headers.authorization ||
        req.path.startsWith('/api/v1/auth') ||
        req.path === '/api/v1/users'
      )
        res.setHeader('Cache-Control', 'no-store');
      if (
        !isAllowedIp(req.ip, this.config.get('IP_ALLOWLIST', { infer: true }))
      ) {
        res.status(403).json({
          statusCode: 403,
          message: 'Acceso no permitido desde esta red.',
        });
        return;
      }
      next();
    });
    const origins = new Set(this.config.get('CORS_ORIGINS', { infer: true }));
    app.enableCors({
      origin: (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void,
      ) => callback(null, origin !== undefined && origins.has(origin)),
      credentials: false,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    });
    api.use(
      this.limiter(
        'global',
        this.config.get('RATE_LIMIT_GLOBAL', { infer: true }),
        60000,
      ),
    );
    api.use(express.json({ limit: 16384, strict: true }));
    api.use(
      express.urlencoded({
        extended: false,
        limit: 16384,
        parameterLimit: 100,
      }),
    );
    this.installSensitiveLimits(api);
  }

  private installSensitiveLimits(api: Express): void {
    const login = '/api/v1/auth/login';
    api.use(
      login,
      this.limiter(
        'login-ip',
        this.config.get('RATE_LIMIT_LOGIN_IP', { infer: true }),
        900000,
      ),
    );
    const account = this.limiter(
      'login-account',
      this.config.get('RATE_LIMIT_LOGIN_ACCOUNT', { infer: true }),
      900000,
      (req) =>
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase()
          : 'invalid',
    );
    api.use(login, (req, res, next) => {
      if (typeof req.body?.email !== 'string' || req.body.email.length > 254) {
        next();
        return;
      }
      account(req, res, next);
    });
    api.use(
      '/api/v1/users',
      this.limiter(
        'register-ip',
        this.config.get('RATE_LIMIT_REGISTER', { infer: true }),
        3600000,
      ),
    );
    api.use(
      ['/api/v1/auth/refresh', '/api/v1/auth/logout'],
      this.limiter(
        'refresh-ip',
        this.config.get('RATE_LIMIT_REFRESH', { infer: true }),
        60000,
      ),
    );
    const writes = this.limiter(
      'writes-ip',
      this.config.get('RATE_LIMIT_WRITES', { infer: true }),
      60000,
    );
    api.use((req, res, next) => {
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method))
        writes(req, res, next);
      else next();
    });
  }

  private limiter(
    scope: string,
    limit: number,
    windowMs: number,
    keyGenerator?: (request: Parameters<RequestHandler>[0]) => string,
  ): RequestHandler {
    return rateLimit({
      windowMs,
      limit,
      identifier: scope,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        statusCode: 429,
        message: 'Demasiadas solicitudes. Intenta nuevamente más tarde.',
      },
      store: new PostgresRateLimitStore(
        this.prisma,
        scope,
        this.config.get('JWT_SECRET', { infer: true }),
      ),
      keyGenerator:
        keyGenerator ??
        ((req) =>
          ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? 'unknown', 64)),
      passOnStoreError: false,
    });
  }
}
```

**Archivo corregido: `src/security/postgres-rate-limit.store.ts`**

```typescript
import { createHmac } from 'node:crypto';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import type { PrismaService } from '@Prisma/services';

export class PostgresRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60000;

  constructor(
    private readonly prisma: PrismaService,
    public readonly prefix: string,
    private readonly secret: string,
  ) {}

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const digest = this.digest(key);
    const rows = await this.prisma.$queryRaw<
      { totalHits: number; resetTime: Date }[]
    >`
      INSERT INTO api_rate_limits (key, hits, expires_at)
      VALUES (${digest}, 1, statement_timestamp() + ${this.windowMs}::double precision * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        hits = CASE WHEN api_rate_limits.expires_at <= statement_timestamp() THEN 1 ELSE LEAST(api_rate_limits.hits, 1000000000) + 1 END,
        expires_at = CASE WHEN api_rate_limits.expires_at <= statement_timestamp()
          THEN statement_timestamp() + ${this.windowMs}::double precision * interval '1 millisecond' ELSE api_rate_limits.expires_at END
      RETURNING hits AS "totalHits", expires_at AS "resetTime"`;
    return rows[0];
  }

  async decrement(key: string): Promise<void> {
    await this.prisma
      .$executeRaw`UPDATE api_rate_limits SET hits=GREATEST(hits-1,0) WHERE key=${this.digest(key)}`;
  }

  async resetKey(key: string): Promise<void> {
    await this.prisma
      .$executeRaw`DELETE FROM api_rate_limits WHERE key=${this.digest(key)}`;
  }

  private digest(key: string): string {
    return (
      this.prefix +
      ':' +
      createHmac('sha256', this.secret)
        .update(this.prefix + ':' + key)
        .digest('hex')
    );
  }
}
```

**Archivo corregido: `src/security/rate-limit-cleanup.service.ts`**

```typescript
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@Prisma/services';

@Injectable()
export class RateLimitCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitCleanupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanup();
    }, 60000);
    this.timer.unref();
  }

  async cleanup(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.prisma
        .$executeRaw`DELETE FROM api_rate_limits WHERE expires_at <= statement_timestamp() AND key IN (SELECT key FROM api_rate_limits WHERE expires_at <= statement_timestamp() LIMIT 10000)`;
      await this.prisma
        .$executeRaw`DELETE FROM refresh_tokens WHERE id IN (SELECT id FROM refresh_tokens WHERE expires_at <= clock_timestamp() LIMIT 10000)`;
    } catch {
      this.logger.warn(
        'No se pudieron limpiar contadores o refresh tokens vencidos.',
      );
    } finally {
      this.running = false;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
```

Código final completo: [src/security/http-security.service.ts](../../src/security/http-security.service.ts), [src/security/postgres-rate-limit.store.ts](../../src/security/postgres-rate-limit.store.ts), [src/security/rate-limit-cleanup.service.ts](../../src/security/rate-limit-cleanup.service.ts), [prisma/migrations/20261114130000_security_rate_limits/migration.sql](../../prisma/migrations/20261114130000_security_rate_limits/migration.sql).

### F02. Rotación de refresh vulnerable a una carrera

- **Severidad:** Alta.
- **Punto afectado:** 8.
- **Ubicación:** `src/auth/services/token.service.ts:73` en la base `c11f843`.

**Fragmento original:**

```typescript
    const stored = await this.refreshTokenRepository.findByTokenHashWithUser(
      this.hashToken(refreshToken),
    );

    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (stored.revokedAt !== null) {
      await this.refreshTokenRepository.revokeAllForUser(stored.userId);
      throw new UnauthorizedException(
        'Refresh token ya utilizado. Se cerraron todas las sesiones por seguridad.',
      );
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expirado.');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('La cuenta está inactiva.');
    }

    await this.refreshTokenRepository.revokeById(stored.id);

    return {
      user: stored.user,
      tokens: await this.issueTokenPair(stored.user),
    };
  }

  /**
```

**Descripción:** La lectura de revokedAt, revocación y creación del reemplazo eran operaciones separadas. Dos solicitudes con el mismo token podían leerlo activo y emitir dos reemplazos. Un error al crear el nuevo token tampoco formaba una unidad atómica con la revocación anterior.

**Solución propuesta y aplicada:** El repositorio bloquea la fila del usuario, relee el token y confirma revocación/reemplazo en una transacción. La detección de reúso devuelve un resultado de dominio y confirma la revocación antes de traducirlo a 401; lanzar dentro de esa transacción habría revertido el control. Un fallo al insertar el reemplazo revierte el intento. Las pruebas fuerzan la coincidencia con un trigger pg_sleep.

**Archivo corregido: `src/auth/repositories/refresh-token.repository.ts`**

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma, RefreshToken, User } from '@PrismaClient';

export interface CreateRefreshTokenData {
  tokenHash: string;
  userId: string;
  expiresAt: Date;
}

/** Refresh token con el usuario dueño ya cargado. */
export type RefreshTokenWithUser = RefreshToken & { user: User };
export type RotationResult<T> =
  | { kind: 'rotated'; user: User; value: T }
  | { kind: 'invalid' | 'reused' | 'expired' | 'inactive' };

/**
 * Único punto del módulo que habla con la tabla `refresh_tokens`.
 *
 * Nota: acá siempre se maneja el *hash* del token, nunca el valor en claro.
 * El hasheo vive en TokenService, que es quien conoce el secreto del esquema.
 */
@Injectable()
export class RefreshTokenRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  create(
    data: CreateRefreshTokenData,
    tx?: Prisma.TransactionClient,
  ): Promise<RefreshToken> {
    return (tx ?? this.prisma).refreshToken.create({ data });
  }

  rotate<T>(
    tokenHash: string,
    issue: (user: User, tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<RotationResult<T>> {
    return this.prisma.$transaction(
      async (tx): Promise<RotationResult<T>> => {
        const owner = await tx.refreshToken.findUnique({
          where: { tokenHash },
          select: { userId: true },
        });
        if (!owner) return { kind: 'invalid' };
        await tx.$queryRaw`SELECT id FROM users WHERE id=${owner.userId}::uuid FOR UPDATE`;
        const stored = await tx.refreshToken.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (!stored) return { kind: 'invalid' };
        if (stored.revokedAt !== null) {
          await tx.refreshToken.updateMany({
            where: { userId: stored.userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          return { kind: 'reused' };
        }
        if (stored.expiresAt.getTime() <= Date.now())
          return { kind: 'expired' };
        if (!stored.user.isActive) return { kind: 'inactive' };
        await tx.refreshToken.update({
          where: { id: stored.id },
          data: { revokedAt: new Date() },
        });
        return {
          kind: 'rotated',
          user: stored.user,
          value: await issue(stored.user, tx),
        };
      },
      { timeout: 10000 },
    );
  }

  /** Busca por hash trayendo el usuario, para validar la sesión en una sola query. */
  findByTokenHashWithUser(
    tokenHash: string,
  ): Promise<RefreshTokenWithUser | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  revokeById(id: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revoca por hash. Devuelve cuántas filas cambiaron.
   *
   * Usa `updateMany` con `revokedAt: null` en el filtro para que sea
   * idempotente: si el token no existe o ya estaba revocado, no lanza, solo
   * devuelve 0.
   */
  revokeByTokenHash(tokenHash: string): Promise<number> {
    return this.prisma.refreshToken
      .updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .then((result) => result.count);
  }

  /** Revoca todas las sesiones activas de un usuario. Devuelve cuántas cerró. */
  revokeAllForUser(userId: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const result = await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return result.count;
    });
  }

  /** Utilidad de mantenimiento: limpia tokens vencidos. */
  deleteExpired(now: Date = new Date()): Promise<number> {
    return this.prisma.refreshToken
      .deleteMany({ where: { expiresAt: { lt: now } } })
      .then((result) => result.count);
  }
}
```

**Archivo corregido: `src/auth/services/token.service.ts`**

```typescript
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { RefreshTokenRepository } from '@Auth/repositories';
import type { AccessTokenPayload, TokenPair } from '@Auth/types';
import type { EnvConfig } from '@Config';
import type { Prisma, User } from '@PrismaClient';
import { ACCESS_TOKEN_POLICY } from '../types/access-token-policy.js';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_BYTES = 32;

/**
 * Emisión, rotación y revocación de tokens.
 *
 * El access token es un JWT de vida corta y sin estado. El refresh token es un
 * string opaco persistido: se guarda su SHA-256, no el valor en claro.
 *
 * Por qué SHA-256 y no bcrypt para el refresh token: son 32 bytes aleatorios,
 * es decir alta entropía, así que no hay un espacio de búsqueda que un KDF
 * lento deba encarecer. Además hace falta buscarlo por hash en un índice
 * (bcrypt genera un salt distinto por hash, así que no se puede indexar) y
 * bcrypt trunca en 72 bytes. bcrypt queda para las contraseñas, que sí son de
 * baja entropía.
 */
@Injectable()
export class TokenService {
  private readonly refreshTokenTtlMs: number;

  constructor(
    @Inject(RefreshTokenRepository)
    private readonly refreshTokenRepository: RefreshTokenRepository,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
  ) {
    this.refreshTokenTtlMs =
      configService.get('REFRESH_TOKEN_EXPIRES_IN_DAYS', { infer: true }) *
      MILLISECONDS_PER_DAY;
  }

  /** Emite un par de tokens nuevo y persiste el refresh token. */
  async issueTokenPair(
    user: User,
    tx?: Prisma.TransactionClient,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId: user.branchId,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');

    const stored = {
      tokenHash: this.hashToken(refreshToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
    };
    if (tx) await this.refreshTokenRepository.create(stored, tx);
    else await this.refreshTokenRepository.create(stored);

    return {
      accessToken,
      refreshToken,
      expiresIn: await this.getAccessTokenTtlSeconds(accessToken),
    };
  }

  /**
   * Canjea un refresh token por un par nuevo (rotación).
   *
   * Incluye detección de reúso: si llega un token que ya fue canjeado, se
   * asume que fue robado y se revocan sus refresh tokens. Los JWT de acceso
   * ya emitidos conservan su vigencia corta hasta expirar.
   */
  async rotate(
    refreshToken: string,
  ): Promise<{ user: User; tokens: TokenPair }> {
    const result = await this.refreshTokenRepository.rotate(
      this.hashToken(refreshToken),
      (user, tx) => this.issueTokenPair(user, tx),
    );
    if (result.kind === 'rotated')
      return { user: result.user, tokens: result.value };
    if (result.kind === 'reused')
      throw new UnauthorizedException(
        'Refresh token ya utilizado. Se revocaron los refresh tokens del usuario por seguridad.',
      );
    throw new UnauthorizedException(
      'Refresh token inválido, expirado o cuenta inactiva.',
    );
  }

  /**
   * Revoca un refresh token puntual (logout).
   *
   * Es idempotente a propósito: un logout con un token ya inválido igual
   * responde 204, así no se convierte en un oráculo para descubrir qué tokens
   * existen.
   */
  async revoke(refreshToken: string): Promise<void> {
    await this.refreshTokenRepository.revokeByTokenHash(
      this.hashToken(refreshToken),
    );
  }

  /** Revoca todas las sesiones activas de un usuario. */
  async revokeAllForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.revokeAllForUser(userId);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Deriva la vigencia del `exp` real del token ya firmado, en vez de reparsear
   * JWT_EXPIRES_IN ("15m", "1h", ...) a mano.
   */
  private async getAccessTokenTtlSeconds(accessToken: string): Promise<number> {
    const decoded = await this.jwtService.verifyAsync<
      AccessTokenPayload & { exp: number; iat: number }
    >(accessToken, ACCESS_TOKEN_POLICY);
    return decoded.exp - decoded.iat;
  }
}
```

Código final completo: [src/auth/repositories/refresh-token.repository.ts](../../src/auth/repositories/refresh-token.repository.ts), [src/auth/services/token.service.ts](../../src/auth/services/token.service.ts).

### F03. Valores conocidos aceptables como credenciales y usuarios demo sin bloqueo de producción

- **Severidad:** Alta.
- **Punto afectado:** 2, 3 y 4.
- **Ubicación:** `prisma/seeds/base-data.ts:4` en la base `c11f843`.

**Fragmento original:**

```typescript
export const DEMO_PASSWORD = '<valor demo fijo; omitido en el informe>';
```

**Descripción:** El seed usaba una contraseña fija para cuentas que incluían personal administrativo y podía ejecutarse en producción. JWT_SECRET aceptaba el valor público de ejemplo por superar 32 caracteres. Compose publicaba PostgreSQL en todas las interfaces y tenía contraseña predeterminada conocida. La explotación requiere que esos defaults/datos demo se usen en un despliegue real; no se halló ni se imprimió una clave productiva del entorno.

**Solución propuesta y aplicada:** Se elimina la contraseña fija, se exige DEMO_SEED_PASSWORD externa y se rechaza crear usuarios demo en producción. La plantilla no contiene credenciales; se rechazan claves JWT evidentes de ejemplo, contraseñas DB comunes y puertos de Compose quedan en loopback. Producción ignora .env y consume variables del servidor. Esto no rota cuentas ya creadas: el operador debe retirar/rotar las que existan.

**Archivo corregido: `prisma/seeds/base-data.ts`**

```typescript
import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '../../src/generated/prisma/client.js';

export const BASE_BRANCHES = [
  { name: 'NoodleVolt Centro', address: 'San Salvador, Centro' },
  { name: 'NoodleVolt Santa Tecla', address: 'La Libertad, Santa Tecla' },
];

const USERS = [
  { role: UserRole.CLIENT, email: 'demo@example.com', branch: null },
  {
    role: UserRole.WAITER,
    email: 'waiter@example.com',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.COOK,
    email: 'cook@example.com',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.CASHIER,
    email: 'cashier@example.com',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.INVENTORY_MANAGER,
    email: 'inventory_manager@example.com',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.BRANCH_ADMIN,
    email: 'branch_admin@example.com',
    name: 'Gerente Santa Tecla',
    branch: 'NoodleVolt Santa Tecla',
  },
  {
    role: UserRole.BRANCH_ADMIN,
    email: 'branch_admin_centro@example.com',
    name: 'Gerente Centro',
    branch: 'NoodleVolt Centro',
  },
  {
    role: UserRole.GENERAL_MANAGER,
    email: 'general_manager@example.com',
    branch: null,
  },
];

export async function seedBaseData(prisma: PrismaClient) {
  if (process.env.NODE_ENV === 'production')
    throw new Error(
      'Los datos y usuarios demo no se pueden crear en producción.',
    );
  const password = process.env.DEMO_SEED_PASSWORD;
  if (
    !password ||
    Buffer.byteLength(password, 'utf8') > 72 ||
    password.length < 12
  )
    throw new Error(
      'Proporciona DEMO_SEED_PASSWORD de 12 caracteres como mínimo y 72 bytes como máximo para crear datos demo.',
    );
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const branches = new Map<string, string>();
    for (const data of BASE_BRANCHES) {
      const branch = await tx.branch.upsert({
        where: { name: data.name },
        update: {},
        create: data,
      });
      branches.set(branch.name, branch.id);
      const room = await tx.diningRoom.upsert({
        where: {
          branchId_name: { branchId: branch.id, name: 'Salón principal' },
        },
        update: {},
        create: { branchId: branch.id, name: 'Salón principal' },
      });
      for (let number = 1; number <= 6; number++) {
        const table = await tx.diningTable.upsert({
          where: {
            branchId_number: { branchId: branch.id, number: String(number) },
          },
          update: {},
          create: {
            branchId: branch.id,
            roomId: room.id,
            number: String(number),
            capacity: 4,
          },
        });
        if (table.roomId === null)
          await tx.diningTable.update({
            where: { id: table.id },
            data: { roomId: room.id },
          });
      }
    }
    for (const user of USERS) {
      const branchId = user.branch === null ? null : branches.get(user.branch);
      if (branchId === undefined)
        throw new Error(`Sucursal del seed inexistente: ${user.branch}`);
      await tx.user.upsert({
        where: { email: user.email },
        update: {},
        create: {
          email: user.email,
          name: user.name ?? user.role,
          lastName: 'Demo',
          passwordHash,
          role: user.role,
          branchId,
        },
      });
    }
  });
}
```

**Archivo corregido: `src/config/env.validation.ts`**

```typescript
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
  };
}
```

Código final completo: [prisma/seeds/base-data.ts](../../prisma/seeds/base-data.ts), [src/config/env.validation.ts](../../src/config/env.validation.ts), [docker-compose.yml](../../docker-compose.yml), [.env.example](../../.env.example).

### F04. Límite de contraseña en caracteres y factor bcrypt sin rango seguro

- **Severidad:** Media.
- **Punto afectado:** 5 y 7.
- **Ubicación:** `src/users/dto/create-user.dto.ts:45` en la base `c11f843`.

**Fragmento original:**

```typescript
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: 'La contraseña debe incluir al menos una minúscula, una mayúscula y un número.',
  })
  password!: string;
}
```

**Descripción:** bcrypt trunca a 72 bytes, mientras MaxLength mide caracteres. Una contraseña Unicode de menos de 72 caracteres podía exceder ese límite y perder parte de su secreto. BCRYPT_SALT_ROUNDS solo exigía un entero positivo: permitía factores débiles o valores que provocaran coste de CPU excesivo.

**Solución propuesta y aplicada:** Se valida IsByteLength(1,72) tanto en registro como login y también se limita el hash en el servicio. Se conserva el salt aleatorio de bcrypt y se admite factor 10..14, por defecto 12. El hash auxiliar de usuario inexistente usa el factor configurado. Una contraseña antigua truncada no se recupera: necesita restablecimiento.

**Archivo corregido: `src/users/dto/create-user.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsByteLength,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

export class CreateUserDto {
  @ApiProperty({
    description: 'Nombre del usuario.',
    example: 'Nestor',
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({
    description: 'Apellido del usuario.',
    example: 'Gonzalez',
    maxLength: 100,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({
    description: 'Email del usuario. Se normaliza a minúsculas y sin espacios.',
    example: 'nestor@example.com',
    format: 'email',
    maxLength: 254,
  })
  @IsNormalizedEmail()
  email!: string;

  @ApiProperty({
    description:
      'Contraseña. Debe incluir al menos una minúscula, una mayúscula y un número.',
    example: 'Str0ngPass',
    minLength: 8,
    maxLength: 72,
  })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  // bcrypt trunca silenciosamente en 72 bytes, así que se rechaza antes de hashear.
  @MaxLength(72, {
    message: 'La contraseña no puede superar los 72 caracteres.',
  })
  @IsByteLength(1, 72, {
    message: 'La contraseña no puede superar los 72 bytes UTF-8.',
  })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'La contraseña debe incluir al menos una minúscula, una mayúscula y un número.',
  })
  password!: string;
}
```

**Archivo corregido: `src/auth/dto/login.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsByteLength, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsNormalizedEmail } from '@Common/decorators';

export class LoginDto {
  @ApiProperty({ example: 'demo@example.com', format: 'email' })
  @IsNormalizedEmail()
  email!: string;

  // A diferencia del registro, acá NO se valida la forma de la contraseña:
  // las reglas de complejidad pueden cambiar con el tiempo y un usuario viejo
  // debe poder seguir entrando. Solo se acota el largo.
  @ApiProperty({ example: 'Demo1234!' })
  @IsString()
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  @MaxLength(72)
  @IsByteLength(1, 72, {
    message: 'La contraseña no puede superar los 72 bytes UTF-8.',
  })
  password!: string;
}
```

**Archivo corregido: `src/users/services/users.service.ts`**

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcrypt';
import { UserRepository } from '@Users/repositories';
import { EmailAlreadyTakenError } from '@Users/errors';
import type { CreateUserDto } from '@Users/dto';
import type { EnvConfig } from '@Config';
import type { User } from '@PrismaClient';

/**
 * Lógica de negocio de usuarios.
 *
 * No conoce Prisma: todo el acceso a datos pasa por UserRepository.
 */
@Injectable()
export class UsersService {
  private readonly saltRounds: number;

  constructor(
    @Inject(UserRepository) private readonly userRepository: UserRepository,
    @Inject(ConfigService) configService: ConfigService<EnvConfig, true>,
  ) {
    this.saltRounds = configService.get('BCRYPT_SALT_ROUNDS', { infer: true });
  }

  async create({
    email,
    password,
    name,
    lastName,
  }: CreateUserDto): Promise<User> {
    const passwordHash = await this.hashPassword(password);

    try {
      return await this.userRepository.create({
        email,
        passwordHash,
        name,
        lastName,
      });
    } catch (error) {
      // Traduce el error de dominio del repositorio a una excepción HTTP.
      if (error instanceof EmailAlreadyTakenError) {
        throw new ConflictException('El email ya está registrado.');
      }
      throw error;
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  findById(id: string): Promise<User | null> {
    return this.userRepository.findById(id);
  }

  hashPassword(password: string): Promise<string> {
    if (Buffer.byteLength(password, 'utf8') > 72)
      throw new BadRequestException(
        'La contraseña no puede superar los 72 bytes UTF-8.',
      );
    return bcrypt.hash(password, this.saltRounds);
  }

  verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }
}
```

Código final completo: [src/users/dto/create-user.dto.ts](../../src/users/dto/create-user.dto.ts), [src/auth/dto/login.dto.ts](../../src/auth/dto/login.dto.ts), [src/users/services/users.service.ts](../../src/users/services/users.service.ts), [src/auth/services/auth.service.ts](../../src/auth/services/auth.service.ts).

### F05. Contrato de access JWT y TTL insuficientemente restringidos

- **Severidad:** Media.
- **Punto afectado:** 8 y 5.
- **Ubicación:** `src/auth/guards/jwt-auth.guard.ts:48` en la base `c11f843`.

**Fragmento original:**

```typescript
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      // Cubre firma inválida, token expirado y token malformado por igual:
      // no conviene decirle al cliente cuál de los tres fue.
      throw new UnauthorizedException('Token de acceso inválido o expirado.');
    }

    // Se relee el usuario en cada request para que una cuenta desactivada o
    // eliminada deje de funcionar sin esperar a que expire el token.
```

**Descripción:** El emisor normal ya emitía JWT de 15 minutos, pero la configuración permitía duraciones arbitrarias. La verificación no exigía la presencia de exp/iat, un sujeto UUID, emisor ni audiencia. jsonwebtoken no acepta alg:none en este uso; no se afirma ese bypass. El riesgo es aceptar un token firmado de contrato incorrecto o sin vencimiento de un emisor/configuración que use la misma clave.

**Solución propuesta y aplicada:** Se fija HS256, issuer/audience y se exige UUID, iat/exp enteros, expiración y duración máxima de 900 segundos. La configuración solo acepta 60..900 segundos y los refresh tienen duración 1..30 días y formato de 64 hexadecimales. Se recarga rol/sucursal desde la cuenta persistida. Los tokens anteriores sin el nuevo contrato deben renovarse o iniciar sesión.

**Archivo corregido: `src/auth/types/access-token-policy.ts`**

```typescript
export const ACCESS_TOKEN_POLICY = {
  algorithms: ['HS256'] as ['HS256'],
  issuer: 'noodlevolt-api',
  audience: 'noodlevolt-client',
  clockTolerance: 0,
};

export const ACCESS_TOKEN_MAX_SECONDS = 900;
```

**Archivo corregido: `src/auth/guards/jwt-auth.guard.ts`**

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '@Users/services';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { RequestWithUser } from '../decorators/current-user.decorator.js';
import type { AccessTokenPayload } from '@Auth/types';
import { isUUID } from 'class-validator';
import {
  ACCESS_TOKEN_MAX_SECONDS,
  ACCESS_TOKEN_POLICY,
} from '../types/access-token-policy.js';

/**
 * Guard global: valida el Bearer token y carga el usuario en el request.
 *
 * Se implementa a mano en vez de usar Passport porque `passport-jwt` es CJS y
 * su interoperabilidad con ESM estricto es frágil. El costo es unas pocas
 * líneas y se gana control sobre el mensaje de error.
 *
 * Importa los decoradores por ruta relativa y no por `@Auth/decorators` para
 * no crear un ciclo entre los barrels de guards/ y decorators/.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('Falta el token de acceso.');
    }

    let payload: AccessTokenPayload;
    try {
      const decoded = await this.jwtService.verifyAsync<
        AccessTokenPayload & { iat?: number; exp?: number }
      >(token, ACCESS_TOKEN_POLICY);
      if (
        typeof decoded.sub !== 'string' ||
        !isUUID(decoded.sub) ||
        !Number.isSafeInteger(decoded.iat) ||
        !Number.isSafeInteger(decoded.exp) ||
        decoded.iat! > Math.floor(Date.now() / 1000) + 5 ||
        decoded.exp! <= decoded.iat! ||
        decoded.exp! - decoded.iat! > ACCESS_TOKEN_MAX_SECONDS
      ) {
        throw new Error('Claims de acceso inválidos');
      }
      payload = decoded;
    } catch {
      // Cubre firma inválida, token expirado y token malformado por igual:
      // no conviene decirle al cliente cuál de los tres fue.
      throw new UnauthorizedException('Token de acceso inválido o expirado.');
    }

    // Se relee el usuario en cada request para que una cuenta desactivada o
    // eliminada deje de funcionar sin esperar a que expire el token.
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('La cuenta no existe o está inactiva.');
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    const match = /^Bearer ([^\s]+)$/i.exec(header ?? '');
    return match && match[1].length <= 4096 ? match[1] : null;
  }
}
```

**Archivo corregido: `src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '@Users';
import { AuthController } from '@Auth/controllers';
import { AuthService, TokenService } from '@Auth/services';
import { RefreshTokenRepository } from '@Auth/repositories';
import { JwtAuthGuard } from '@Auth/guards';
import type { EnvConfig } from '@Config';
import { ACCESS_TOKEN_POLICY } from './types/access-token-policy.js';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        secret: configService.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', { infer: true }),
          algorithm: 'HS256',
          issuer: ACCESS_TOKEN_POLICY.issuer,
          audience: ACCESS_TOKEN_POLICY.audience,
        },
        verifyOptions: ACCESS_TOKEN_POLICY,
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, RefreshTokenRepository, JwtAuthGuard],
  // JwtAuthGuard se exporta para que app.module.ts pueda registrarlo como
  // APP_GUARD con sus dependencias (JwtService, UsersService) ya resueltas.
  exports: [AuthService, TokenService, RefreshTokenRepository, JwtAuthGuard],
})
export class AuthModule {}
```

**Archivo corregido: `src/auth/dto/refresh-token.dto.ts`**

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token obtenido en el login.',
    minLength: 64,
    maxLength: 64,
  })
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, {
    message:
      'El refresh token debe contener exactamente 64 caracteres hexadecimales.',
  })
  refreshToken!: string;
}
```

Código final completo: [src/auth/guards/jwt-auth.guard.ts](../../src/auth/guards/jwt-auth.guard.ts), [src/auth/auth.module.ts](../../src/auth/auth.module.ts), [src/auth/types/access-token-policy.ts](../../src/auth/types/access-token-policy.ts), [src/config/env.validation.ts](../../src/config/env.validation.ts).

### F06. Transporte de producción sin una política exigible en la aplicación

- **Severidad:** Media.
- **Punto afectado:** 3 y 7.
- **Ubicación:** `src/prisma/services/prisma.service.ts:29` en la base `c11f843`.

**Fragmento original:**

```typescript
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    });

    super({
```

**Descripción:** Prisma recibía DATABASE_URL sin exigir un modo de verificación TLS y Nest escuchaba HTTP. Un despliegue sin gateway o sin TLS hacia PostgreSQL podía transportar credenciales/datos sin la protección esperada. El repositorio no demuestra si la infraestructura anterior ya terminaba TLS; no se afirma haber inspeccionado sus certificados.

**Solución propuesta y aplicada:** Producción exige exactamente sslmode=verify-full, rechaza overrides ambiguos de conexión y NODE_TLS_REJECT_UNAUTHORIZED=0, y responde 426 a API sobre HTTP. Solo admite el esquema reenviado por proxies CIDR confiables. La excepción GET/HEAD del health check no expone datos privados. El operador debe instalar certificados/gateway y revisar cifrado de discos/respaldos; no se acredita esa infraestructura con tests locales.

**Archivo corregido: `src/main.ts`**

```typescript
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './configure-app.js';
import type { EnvConfig } from '@Config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApp(app);
  const config = app.get(ConfigService<EnvConfig, true>);
  await app.listen(config.get('PORT', { infer: true }));
}

await bootstrap();
```

**Archivo corregido: `src/configure-app.ts`**

```typescript
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { EnvConfig } from '@Config';
import { HttpSecurityService } from './security/http-security.service.js';

export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService<EnvConfig, true>);
  app.get(HttpSecurityService).install(app);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.enableShutdownHooks();
  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const swagger = new DocumentBuilder()
      .setTitle('NoodleVolt API')
      .setDescription('API REST de NoodleVolt.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swagger),
    );
  }
}
```

Código final completo: [src/config/env.validation.ts](../../src/config/env.validation.ts), [src/security/http-security.service.ts](../../src/security/http-security.service.ts), [docker-compose.yml](../../docker-compose.yml).

### F07. Logs de errores completos con posible información sensible

- **Severidad:** Media.
- **Punto afectado:** 3.
- **Ubicación:** `src/catalog/menu/services/menu.service.ts:58` en la base `c11f843`.

**Fragmento original:**

```typescript
this.logger.warn('No se pudo verificar la disponibilidad de insumos.', error);
sufficient = new Set<string>();
```

**Descripción:** El verificador de insumos pasaba su Error completo a warn y Prisma emitía errores automáticamente en producción. Esos mensajes pueden incorporar parámetros, datos personales o detalles de conexión. No se detectó que la respuesta HTTP normal incluyera contraseñas; el riesgo descrito corresponde a los logs y a excepciones internas futuras.

**Solución propuesta y aplicada:** Se eliminan parámetros de errores del aviso, se desactivan logs automáticos de Prisma en producción y se usa un filtro con errores 500 genéricos y requestId. Los errores de validación/negocio mantienen sus contratos. Las pruebas incluyen un secreto aleatorio dentro de errores y verifican que no aparece en respuesta ni logs.

**Archivo corregido: `src/security/safe-exception.filter.ts`**

```typescript
import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SafeExceptionFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    if (error instanceof HttpException && error.getStatus() < 500) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'string'
            ? { statusCode: error.getStatus(), message: body }
            : body,
        );
      return;
    }
    const parserType =
      typeof error === 'object' && error !== null && 'type' in error
        ? error.type
        : null;
    if (
      parserType === 'entity.too.large' ||
      parserType === 'entity.parse.failed' ||
      parserType === 'parameters.too.many' ||
      parserType === 'encoding.unsupported' ||
      parserType === 'charset.unsupported'
    ) {
      const status =
        parserType === 'entity.parse.failed'
          ? 400
          : ['encoding.unsupported', 'charset.unsupported'].includes(parserType)
            ? 415
            : 413;
      response.status(status).json({
        statusCode: status,
        message:
          'El cuerpo de la solicitud no es válido o supera el límite permitido.',
      });
      return;
    }
    this.logger.error({
      event: 'internal_error',
      requestId: response.getHeader('X-Request-Id') ?? null,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    response
      .status(500)
      .json({ statusCode: 500, message: 'Internal server error' });
  }
}
```

**Archivo corregido: `src/prisma/services/prisma.service.ts`**

```typescript
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@PrismaClient';
import type { EnvConfig } from '@Config';

/**
 * Cliente de Prisma atado al ciclo de vida de Nest.
 *
 * Desde Prisma 7 la conexión ya no se resuelve desde schema.prisma: hay que
 * pasarle un driver adapter con la connection string en tiempo de ejecución.
 *
 * Solo los repositorios deberían inyectar este servicio. Los servicios de
 * negocio hablan con los repositorios, no con Prisma.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService<EnvConfig, true>) {
    const adapter = new PrismaPg({
      connectionString: configService.get('DATABASE_URL', { infer: true }),
    });

    super({
      adapter,
      log:
        configService.get('NODE_ENV', { infer: true }) === 'development'
          ? ['warn', 'error']
          : [],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conectado a PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

**Archivo corregido: `src/catalog/menu/services/menu.service.ts`**

```typescript
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DishResponseDto } from '../dto/dish-response.dto.js';
import { MenuResponseDto } from '../dto/index.js';
import { BranchNotFoundError } from '../errors/index.js';
import { INGREDIENT_AVAILABILITY_CHECKER } from '../ports/index.js';
import type { IngredientAvailabilityChecker } from '../ports/index.js';
import { MenuRepository } from '../repositories/index.js';
import type { BranchMenu, MenuCategory, PublicMenu } from '../types/index.js';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(
    @Inject(MenuRepository) private readonly repository: MenuRepository,
    @Inject(INGREDIENT_AVAILABILITY_CHECKER)
    private readonly ingredients: IngredientAvailabilityChecker,
  ) {}

  async getMenu(branchId: string): Promise<MenuResponseDto> {
    return MenuResponseDto.fromMenu(await this.loadMenu(branchId));
  }

  async listAvailableDishes(branchId: string): Promise<DishResponseDto[]> {
    const menu = await this.loadMenu(branchId);
    return menu.categories.flatMap((category) =>
      category.dishes
        .filter((dish) => dish.available)
        .map((dish) => ({
          id: dish.id,
          branchId: menu.branch.id,
          name: dish.name,
          description: dish.description,
          price: dish.price.toFixed(2),
          isAvailable: true,
          category: { id: category.id, name: category.name },
        })),
    );
  }

  private async loadMenu(branchId: string): Promise<PublicMenu> {
    let menu: BranchMenu;
    try {
      menu = await this.repository.findByBranchId(branchId);
    } catch (error) {
      if (error instanceof BranchNotFoundError)
        throw new NotFoundException(error.message);
      throw error;
    }

    let sufficient: ReadonlySet<string>;
    try {
      sufficient = await this.ingredients.findSufficientDishIds(
        branchId,
        menu.dishes.map((dish) => dish.id),
      );
    } catch {
      this.logger.warn('No se pudo verificar la disponibilidad de insumos.');
      sufficient = new Set<string>();
    }
    const categories = new Map<string, MenuCategory>();
    for (const dish of menu.dishes) {
      let category = categories.get(dish.category.id);
      if (!category) {
        category = { ...dish.category, dishes: [] };
        categories.set(category.id, category);
      }
      category.dishes.push({
        ...dish,
        available:
          dish.isAvailable &&
          dish.status === 'AVAILABLE' &&
          sufficient.has(dish.id),
      });
    }
    const orderedCategories = [...categories.values()].sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || compareNames(left, right),
    );
    for (const category of orderedCategories)
      category.dishes.sort(compareNames);
    return { branch: menu.branch, categories: orderedCategories };
  }
}

function compareNames(
  left: { id: string; name: string },
  right: { id: string; name: string },
): number {
  return (
    left.name.localeCompare(right.name, 'es') || left.id.localeCompare(right.id)
  );
}
```

Código final completo: [src/security/safe-exception.filter.ts](../../src/security/safe-exception.filter.ts), [src/prisma/services/prisma.service.ts](../../src/prisma/services/prisma.service.ts), [src/catalog/menu/services/menu.service.ts](../../src/catalog/menu/services/menu.service.ts).

### F08. Dependencias con avisos de seguridad conocidos

- **Severidad:** Alta.
- **Punto afectado:** 1 y 5; componentes usados por 7/8.
- **Ubicación:** `package.json:47` en la base `c11f843`.

**Fragmento original:**

```json
    "@nestjs/platform-express": "^12.0.1",
    "@nestjs/swagger": "^12.0.1",
```

**Descripción:** npm audit --omit=dev reportó 10 avisos en el árbol de producción: ocho altos y dos moderados. Entre ellos body-parser tenía un vector de DoS con cuerpos comprimidos. No todos los transitivos eran explotables desde estas rutas: mysql2, por ejemplo, no es el driver utilizado por la aplicación PostgreSQL. También había avisos en herramientas de desarrollo.

**Solución propuesta y aplicada:** Se actualizó el lockfile con versiones corregidas, se elevaron mínimos de platform-express/Prisma y se incorporaron dependencias de seguridad. Vitest/cobertura pasan a 5 y sus suites mantienen ejecución no concurrente. Los overrides de undici/tmp se limitan al árbol de @nestjs/mau, sin degradar ese CLI ni aplicar npm audit fix --force. La auditoría final de todo el árbol informa cero avisos; eso no equivale a demostrar ausencia de vulnerabilidades desconocidas.

**Archivo corregido: `package.json`**

```json
{
  "name": "si_be_boilerplate",
  "version": "0.0.1",
  "description": "",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "type": "module",
  "scripts": {
    "build": "nest build && tsc-alias -p tsconfig.build.json && node scripts/check-runtime-imports.mjs",
    "deploy": "nest deploy",
    "postinstall": "prisma generate",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy",
    "prisma:studio": "prisma studio",
    "db:seed": "prisma db seed",
    "db:seed:loyalty": "tsx prisma/seeds/run-loyalty.ts",
    "db:seed:base": "tsx prisma/seeds/run-base.ts",
    "db:seed:review": "tsx prisma/seeds/run-review.ts",
    "db:seed:sales-report": "tsx prisma/seeds/run-sales-report.ts",
    "db:seed:catalog": "tsx prisma/seeds/run-catalog.ts",
    "db:seed:branch-config": "tsx prisma/seeds/run-branch-config.ts",
    "db:seed:inventory": "tsx prisma/seeds/run-inventory.ts",
    "db:reset": "prisma migrate reset",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "npm run build && node dist/main.js",
    "start:dev": "concurrently --kill-others --names \"nest,alias\" -c \"green,cyan\" \"nest start --watch\" \"tsc-alias -w -p tsconfig.build.json\"",
    "start:debug": "concurrently --kill-others --names \"nest,alias\" -c \"green,cyan\" \"nest start --debug --watch\" \"tsc-alias -w -p tsconfig.build.json\"",
    "start:prod": "node --input-type=module -e \"process.env.NODE_ENV='production'; await import('./dist/main.js')\"",
    "lint": "oxlint --type-aware src/ test/",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "test:debug": "vitest --inspect-brk --no-file-parallelism",
    "test:e2e": "vitest run --config ./vitest.config.e2e.ts",
    "test:db": "vitest run --config ./vitest.config.db.ts",
    "test:security": "vitest run --config ./vitest.config.db.ts test/db-security.e2e-spec.ts",
    "audit:production": "npm audit --omit=dev --audit-level=high",
    "test:migrations": "node scripts/check-migration-reversals.mjs",
    "db:seed:notifications": "tsx prisma/seeds/run-notifications.ts",
    "db:seed:rewards": "tsx prisma/seeds/run-rewards.ts"
  },
  "dependencies": {
    "@nestjs/common": "^12.0.1",
    "@nestjs/config": "^12.0.1",
    "@nestjs/core": "^12.0.1",
    "@nestjs/jwt": "^12.0.2",
    "@nestjs/platform-express": "^12.5.0",
    "@nestjs/swagger": "^12.0.1",
    "@prisma/adapter-pg": "^7.10.1",
    "@prisma/client": "^7.10.0",
    "bcrypt": "^6.0.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.15.1",
    "dotenv": "^18.0.9",
    "express": "^5.3.0",
    "express-rate-limit": "^8.7.4",
    "helmet": "^8.3.0",
    "ipaddr.js": "^2.5.0",
    "pg": "^8.23.1",
    "prisma": "^7.10.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "overrides": {
    "@nestjs/mau": {
      "undici": "^6.29.1",
      "tmp": "^0.2.7"
    }
  },
  "devDependencies": {
    "@nestjs/cli": "^12.0.0",
    "@nestjs/mau": "^0.2.6",
    "@nestjs/schematics": "^12.0.0",
    "@nestjs/testing": "^12.0.1",
    "@types/bcrypt": "^6.0.0",
    "@types/express": "^5.0.0",
    "@types/node": "^24.0.0",
    "@types/pg": "^8.23.1",
    "@types/supertest": "^7.0.0",
    "@vitest/coverage-v8": "^5.1.0",
    "concurrently": "^10.0.5",
    "oxlint": "^1.58.0",
    "oxlint-tsgolint": "^7.0.2001",
    "prettier": "^3.4.2",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "tsc-alias": "^1.9.5",
    "tsx": "^4.23.15",
    "typescript": "^6.0.2",
    "vite-tsconfig-paths": "^5.1.4",
    "vitest": "^5.1.0"
  }
}
```

Código final completo: [package.json](../../package.json), [package-lock.json](../../package-lock.json), [.github/workflows/security.yml](../../.github/workflows/security.yml).

### F09. Archivo de pruebas exportado al arranque de producción

- **Severidad:** Alta.
- **Punto afectado:** Hallazgo adicional de arquitectura y disponibilidad; punto 3 (configuración productiva).
- **Ubicación:** `src/reports/services/index.ts:3` en la base `c11f843`.

**Fragmento original:**

```typescript
export * from './sales-date-range.spec.js';
```

**Descripción:** El barrel de servicios exportaba un spec. Aunque tsconfig excluía pruebas como entradas, esa referencia volvía a incluirlo en dist y cargaba Vitest al iniciar Node. El arranque real falló antes de validar configuración; las suites de Vitest y la compilación por sí solas no detectaban el problema. Es un fallo de empaquetado y disponibilidad, no evidencia de una explotación remota por HTTP.

**Solución propuesta y aplicada:** Se elimina la exportación del spec y cada build ejecuta una comprobación AST de imports/exports de runtime y de archivos compilados, rechazando referencias a pruebas y Vitest. Se comprobó además Node fuera del runner con PostgreSQL real y una petición al health check, y start:prod rechazó secretos ausentes sin cargar .env.

**Archivo corregido: `src/reports/services/index.ts`**

```typescript
export * from './sales-date-range.js';
export * from './sales-report.service.js';
```

**Archivo corregido: `scripts/check-runtime-imports.mjs`**

```typescript
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === 'generated') continue;
    const path = `${root}/${entry.name}`;
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}

const isTest = (path) =>
  /\.(?:spec|test|e2e-spec)(?:\.[cm]?[jt]s)?$/.test(path);
const isTestImport = (path) =>
  isTest(path) ||
  /^(?:vitest(?:\/|$)|@vitest\/)/.test(path) ||
  path.includes('/__tests__/');
const failures = [];
for (const path of await files('src')) {
  if (!path.endsWith('.ts') || isTest(path)) continue;
  const ast = ts.createSourceFile(
    path,
    await readFile(path, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    let value;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      value = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(ast) === 'require')
    )
      value = node.arguments[0];
    if (value && ts.isStringLiteralLike(value) && isTestImport(value.text))
      failures.push(`${path} -> ${value.text}`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
for (const path of await files('dist')) if (isTest(path)) failures.push(path);
if (failures.length)
  throw new Error(
    `Se detectaron pruebas o imports de Vitest en runtime:\n${failures.join('\n')}`,
  );
process.stdout.write(
  'OK: runtime sin archivos de prueba ni imports de Vitest.\n',
);
```

Código final completo: [src/reports/services/index.ts](../../src/reports/services/index.ts), [scripts/check-runtime-imports.mjs](../../scripts/check-runtime-imports.mjs), [package.json](../../package.json).

## Alcance y evidencia

El [inventario por archivo y módulo](inventario.md) incluye 247 archivos de runtime, 33 declaraciones de rutas y los hashes de los contenidos revisados. La revisión combina parser TypeScript, búsquedas de secretos/APIs peligrosas, análisis de las fronteras HTTP y pruebas reales. No se trata de un pentest de infraestructura ni de una revisión de todo el historial Git.

Se preserva el JWT stateless: no se implementó denylist de access tokens. Si se exige cierre instantáneo por sesión, hará falta ese diseño adicional. Para RLS se necesita diseñar roles/tenant y transacciones de conexión; esta entrega acredita aislamiento de aplicación, no un RLS SQL que no existe.

Los dos fallos conocidos de BE-02 (pickupAt y AT_COUNTER) se mantienen separados de los controles de seguridad. No se cambian asserts ni se omiten casos para ocultarlos. Los errores provocados de tabla de cuotas y de triggers prueban fallo cerrado y rollback.

Resultados definitivos y comandos: [PR de seguridad](../pr/SECURITY-backend-hardening.md). Despliegue y decisiones operativas: [operación](operacion.md).
