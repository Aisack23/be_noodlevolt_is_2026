import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@Prisma/services';
import type { Prisma, RefreshToken, User } from '@PrismaClient';

export interface CreateRefreshTokenData {
  id?: string;
  familyId?: string;
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

  async findActiveUser(id: string, userId: string): Promise<User | null> {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() }, user: { isActive: true } },
      select: { user: true },
    });
    return session?.user ?? null;
  }

  rotate<T>(
    tokenHash: string,
    issue: (user: User, tx: Prisma.TransactionClient, familyId: string) => Promise<T>,
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
          value: await issue(stored.user, tx, stored.familyId ?? stored.id),
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
   * Revoca la sesión completa, incluso si el token recibido acaba de rotar.
   * Usa el mismo bloqueo del usuario que rotate para serializar ambas operaciones.
   */
  revokeByTokenHash(tokenHash: string): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.refreshToken.findUnique({
        where: { tokenHash },
        select: { id: true, familyId: true, userId: true },
      });
      if (!token) return 0;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${token.userId}::uuid FOR UPDATE`;
      const familyId = token.familyId ?? token.id;
      const result = await tx.refreshToken.updateMany({
        where: { userId: token.userId, revokedAt: null, OR: [{ familyId }, { id: familyId }] },
        data: { revokedAt: new Date() },
      });
      return result.count;
    });
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
