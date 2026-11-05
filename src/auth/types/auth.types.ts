/** Payload que viaja dentro del JWT de acceso. 
export interface AccessTokenPayload {
  /** ID del usuario (claim estándar `sub`). 
  sub: string;
  email: string;
}

/** Par de tokens devuelto por login y refresh. 
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Vigencia del access token, en segundos. 
  expiresIn: number;
}*/


import type { UserRole } from '@PrismaClient';

/**
 * Payload del JWT de acceso.
 *
 * El rol y la sucursal provienen del usuario
 * persistido en PostgreSQL, nunca del cliente.
 *
 * branchId es null para CLIENT y GENERAL_MANAGER.
 */
export interface AccessTokenPayload {
  /** Identificador del usuario. */
  sub: string;

  /** Correo electrónico del usuario. */
  email: string;

  /** Rol asignado al usuario. */
  role: UserRole;

  /** Sucursal asignada, si corresponde. */
  branchId: string | null;
}

/** Par de tokens devuelto por login y refresh. */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;

  /** Vigencia del access token, en segundos. */
  expiresIn: number;
}

