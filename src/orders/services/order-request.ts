import { createHash } from 'node:crypto';
import type { CreateOrderDto } from '../dto/create-order.dto.js';

export function normalizeOrder(input: CreateOrderDto): CreateOrderDto {
  return {
    branchId: input.branchId.toLowerCase(),
    operationKey: input.operationKey.toLowerCase(),
    lines: input.lines
      .map((line) => ({
        dishId: line.dishId.toLowerCase(),
        quantity: line.quantity,
      }))
      .sort((left, right) => left.dishId.localeCompare(right.dishId)),
  };
}

export function orderRequestHash(
  customerId: string,
  input: CreateOrderDto,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ customerId, ...input }))
    .digest('hex');
}
