import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenRepository } from '@Auth/repositories';
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
    @Inject(RefreshTokenRepository) private readonly sessions: RefreshTokenRepository,
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
        typeof decoded.sid !== 'string' ||
        !isUUID(decoded.sid) ||
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
    const user = await this.sessions.findActiveUser(payload.sid, payload.sub);
    if (!user) {
      throw new UnauthorizedException('La sesión ya no está activa.');
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(header: string | undefined): string | null {
    const match = /^Bearer ([^\s]+)$/i.exec(header ?? '');
    return match && match[1].length <= 4096 ? match[1] : null;
  }
}
