import { createHash } from 'node:crypto';
import type { CreateOrderDto } from '../dto/create-order.dto.js';
import type { CreateSalonOrderDto } from '../dto/create-salon-order.dto.js';

export interface NormalizedOrder {
  branchId: string;
  operationKey: string;
  paymentMode: 'ONLINE' | 'AT_COUNTER';
  lines: { dishId: string; quantity: number; expectedPrice?: string }[];
}

export type NormalizedSalonOrder = {
  tableId: string;
  operationKey: string;
  lines: { dishId: string; quantity: number; note: string | null }[];
};

export function normalizeOrder(input: CreateOrderDto): NormalizedOrder {
  return {
    branchId: input.branchId.toLowerCase(),
    operationKey: input.operationKey.toLowerCase(),
    paymentMode: input.paymentMode ?? 'ONLINE',
    lines: input.lines
      .map((line) => ({
        dishId: line.dishId.toLowerCase(),
        quantity: line.quantity,
        ...(line.expectedPrice === undefined
          ? {}
          : { expectedPrice: normalizePrice(line.expectedPrice) }),
      }))
      .sort((left, right) => left.dishId.localeCompare(right.dishId)),
  };
}

export function normalizeSalonOrder(
  input: CreateSalonOrderDto,
): NormalizedSalonOrder {
  return {
    tableId: input.tableId.toLowerCase(),
    operationKey: input.operationKey.toLowerCase(),
    lines: input.lines
      .map((line) => ({
        dishId: line.dishId.toLowerCase(),
        quantity: line.quantity,
        note: normalizeNote(line.note),
      }))
      .sort((left, right) =>
        left.dishId.localeCompare(right.dishId) ||
        String(left.note ?? '').localeCompare(String(right.note ?? '')),
      ),
  };
}

export function salonOrderRequestHash(
  waiterId: string,
  input: NormalizedSalonOrder,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        waiterId,
        tableId: input.tableId,
        operationKey: input.operationKey,
        lines: input.lines.map((line) => ({
          ...line,
          note: normalizeNote(line.note),
        })),
      }),
    )
    .digest('hex');
}

export function hasDuplicateSalonLines(lines: NormalizedSalonOrder['lines']) {
  const seen = new Set<string>();
  for (const line of lines) {
    const key = `${line.dishId}:${line.note ?? ''}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function orderRequestHash(
  customerId: string,
  input: CreateOrderDto,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        customerId,
        branchId: input.branchId,
        operationKey: input.operationKey,
        lines: input.lines,
        ...(input.paymentMode === 'AT_COUNTER'
          ? { paymentMode: input.paymentMode }
          : {}),
      }),
    )
    .digest('hex');
}

export function normalizePrice(price: string): string {
  const [whole, fraction = ''] = price.split('.');
  return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`;
}

function normalizeNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}