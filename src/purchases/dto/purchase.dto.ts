import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsDateString, IsString, IsUUID,
  Matches, MaxLength, MinLength, ValidateIf, ValidateNested,
} from 'class-validator';

class PurchaseLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchIngredientId!: string;

  @ApiProperty({ example: '2.500' })
  @IsString()
  @Matches(/^(?!0+(?:\.0+)?$)\d{1,11}(?:\.\d{1,3})?$/)
  quantity!: string;

  @ApiProperty({ example: '5.2500' })
  @IsString()
  @Matches(/^\d{1,8}(?:\.\d{1,4})?$/)
  unitCost!: string;

  @ApiPropertyOptional({ format: 'date' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  expirationDate?: string;
}

export class CreatePurchaseDto {
  @ApiProperty({ maxLength: 180 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  supplier!: string;

  @ApiProperty({ maxLength: 80 })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  invoiceNumber!: string;

  @ApiProperty({ type: [PurchaseLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => PurchaseLineDto)
  lines!: PurchaseLineDto[];
}

export class PurchaseDetailResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  ingredientName!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ example: '2.500' })
  quantity!: string;

  @ApiProperty({ example: '5.2500' })
  unitCost!: string;

  @ApiProperty({ type: String, format: 'date', nullable: true })
  expirationDate!: string | null;
}

export class PurchaseResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  supplier!: string;

  @ApiProperty({ type: String, nullable: true })
  invoiceNumber!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  purchasedAt!: string;

  @ApiProperty({ type: [PurchaseDetailResponseDto] })
  details!: PurchaseDetailResponseDto[];
}

export class PurchasesPageDto {
  @ApiProperty({ type: [PurchaseResponseDto] })
  items!: PurchaseResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
