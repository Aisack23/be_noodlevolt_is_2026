import { createHash } from 'node:crypto';
import type { CreateOrderDto } from '../dto/create-order.dto.js';

export interface NormalizedOrder {
  branchId: string;
  operationKey: string;
  paymentMode: 'ONLINE' | 'AT_COUNTER';
  lines: { dishId: string; quantity: number; expectedPrice?: string }[];
}

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
