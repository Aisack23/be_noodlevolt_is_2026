import {
  Inject,
  Injectable,
  UnauthorizedException,
  type OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { UsersService } from '@Users/services';
import { TokenService } from './token.service.js';
import type { LoginDto } from '@Auth/dto';
import type { TokenPair } from '@Auth/types';
import type { User } from '@PrismaClient';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash!: string;
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(TokenService) private readonly tokenService: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.usersService.hashPassword(
      randomBytes(32).toString('hex'),
    );
  }

  async login(dto: LoginDto): Promise<{ user: User; tokens: TokenPair }> {
    const user = await this.validateCredentials(dto.email, dto.password);
    return { user, tokens: await this.tokenService.issueTokenPair(user) };
  }

  /**
   * Valida email y contraseña.
   *
   * Responde el mismo 401 genérico en los tres casos posibles (email no
   * registrado, contraseña incorrecta, cuenta inactiva) para no filtrar qué
   * emails tienen cuenta.
   */
  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.usersService.verifyPassword(password, this.dummyHash);
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    const passwordMatches = await this.usersService.verifyPassword(
      password,
      user.passwordHash,
    );

    if (!passwordMatches || !user.isActive) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    return user;
  }

  refresh(refreshToken: string): Promise<{ user: User; tokens: TokenPair }> {
    return this.tokenService.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokenService.revoke(refreshToken);
  }
}
