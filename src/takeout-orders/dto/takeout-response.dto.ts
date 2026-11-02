import { ApiProperty } from '@nestjs/swagger';
import { Decimal } from 'decimal.js';
import type { TakeoutOrder } from '../types/index.js';

export class TakeoutLineResponseDto {
  @ApiProperty({ example: 'Ramen de pollo' })
  nombre!: string;

  @ApiProperty({ example: 2 })
  cantidad!: number;

  @ApiProperty({ type: String, example: '8.50' })
  precio!: string;

  @ApiProperty({ type: String, example: '17.00' })
  subtotal!: string;
}

export class TakeoutResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'PENDIENTE' })
  estado!: string;

  @ApiProperty({ enum: ['EN_LINEA', 'EN_CAJA'] })
  modalidadPago!: 'EN_LINEA' | 'EN_CAJA';

  @ApiProperty({ type: [TakeoutLineResponseDto] })
  lineas!: TakeoutLineResponseDto[];

  @ApiProperty({ type: String, example: '17.00' })
  total!: string;

  @ApiProperty({ example: '2026-11-02T12:20:00.000-06:00' })
  horaRetiro!: string;

  static fromOrder(order: TakeoutOrder): TakeoutResponseDto {
    if (!order.pickupAt || !order.paymentMode)
      throw new Error(
        'El pedido para llevar no tiene modalidad u hora de retiro.',
      );

    const total = order.lines.reduce(
      (sum, line) => sum.plus(line.unitPrice.mul(line.quantity)),
      new Decimal(0),
    );
    return {
      id: order.id,
      estado: statusInSpanish(order.status),
      modalidadPago: order.paymentMode === 'ONLINE' ? 'EN_LINEA' : 'EN_CAJA',
      lineas: order.lines.map((line) => ({
        nombre: line.name,
        cantidad: line.quantity,
        precio: line.unitPrice.toFixed(2),
        subtotal: line.unitPrice.mul(line.quantity).toFixed(2),
      })),
      total: total.toFixed(2),
      horaRetiro: formatInBranchZone(order.pickupAt, order.timeZone),
    };
  }
}

function statusInSpanish(status: string): string {
  const statuses: Record<string, string> = {
    PENDING_PAYMENT: 'PENDIENTE_PAGO',
    PENDING: 'PENDIENTE',
    CONFIRMED: 'CONFIRMADO',
    IN_PREPARATION: 'EN_PREPARACION',
    READY: 'LISTO',
    DELIVERED: 'ENTREGADO',
    CANCELED: 'CANCELADO',
  };
  return statuses[status] ?? status;
}

function formatInBranchZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  });
  const parts = new Map<string, string>(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const read = (key: string) => parts.get(key) ?? '';
  const offset = read('timeZoneName').replace('GMT', '') || '+00:00';
  return `${read('year')}-${read('month')}-${read('day')}T${read('hour')}:${read('minute')}:${read('second')}.${read('fractionalSecond')}${offset}`;
}
