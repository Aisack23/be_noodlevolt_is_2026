import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Inject, Injectable, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import express, { type Express, type RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { PrismaService } from '@Prisma/services';
import type { EnvConfig } from '@Config';
import { isAllowedIp, trustProxySetting } from './network-policy.js';
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
    api.set(
      'trust proxy',
      trustProxySetting(
        this.config.get('TRUSTED_PROXY_CIDRS', { infer: true }),
        this.config.get('TRUSTED_PROXY_HOPS', { infer: true }),
      ),
    );
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
