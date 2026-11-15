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
