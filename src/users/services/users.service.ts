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
