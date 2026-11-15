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
