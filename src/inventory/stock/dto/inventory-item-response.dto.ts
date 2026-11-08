import { ApiProperty } from '@nestjs/swagger';
import type { InventoryStockItem } from '../types/index.js';

export class InventoryItemResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Existencia en la sucursal.' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty({ example: 'NoodleVolt Centro' })
  branchName!: string;

  @ApiProperty({ example: 'Fideos de ramen' })
  name!: string;

  @ApiProperty({ example: 'kg' })
  unit!: string;

  @ApiProperty({ type: Number, example: 3 })
  currentStock!: number;

  @ApiProperty({ type: Number, example: 5 })
  minimumStock!: number;

  @ApiProperty({
    example: true,
    description: 'Verdadero si currentStock es menor o igual que minimumStock.',
  })
  isLowStock!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    example: '2026-11-05T18:00:00.000Z',
    description: 'Última actualización de la existencia.',
  })
  updatedAt!: string;

  static fromItem(
    item: InventoryStockItem,
    isLowStock: boolean,
  ): InventoryItemResponseDto {
    return {
      id: item.id,
      branchId: item.branchId,
      branchName: item.branchName,
      name: item.name,
      unit: item.unit,
      currentStock: item.currentStock.toNumber(),
      minimumStock: item.minimumStock.toNumber(),
      isLowStock,
      updatedAt: item.updatedAt.toISOString(),
    };
  }
}
