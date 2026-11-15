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
