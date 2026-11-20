import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from '@Users/dto';
import type { User } from '@PrismaClient';
import type { TokenPair } from '@Auth/types';

export class SessionUserResponseDto extends UserResponseDto {
  @ApiProperty()
  name!: string | null;

  @ApiProperty()
  role!: User['role'];

  @ApiProperty({ type: String, nullable: true, format: 'uuid' })
  branchId!: string | null;

  static fromEntity(user: User): SessionUserResponseDto {
    return {
      ...UserResponseDto.fromEntity(user),
      name: user.name,
      role: user.role,
      branchId: user.branchId,
    };
  }
}

export class AuthResponseDto {
  @ApiProperty({ description: 'JWT de acceso, para el header Authorization: Bearer.' })
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco para renovar el acceso en POST /auth/refresh.' })
  refreshToken!: string;

  @ApiProperty({ description: 'Vigencia del access token, en segundos.', example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  refreshExpiresAt!: string;

  @ApiProperty({ type: SessionUserResponseDto })
  user!: SessionUserResponseDto;

  static from(user: User, tokens: TokenPair): AuthResponseDto {
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      refreshExpiresAt: tokens.refreshExpiresAt,
      user: SessionUserResponseDto.fromEntity(user),
    };
  }
}
