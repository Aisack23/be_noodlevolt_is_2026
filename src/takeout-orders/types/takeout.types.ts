import type { Decimal } from 'decimal.js';

export type TakeoutPaymentMode = 'ONLINE' | 'AT_COUNTER';

export interface TakeoutLineInput {
  dishId: string;
  quantity: number;
  expectedPrice: string;
}

export interface TakeoutInput {
  branchId: string;
  paymentMode: TakeoutPaymentMode;
  lines: TakeoutLineInput[];
}

export interface TakeoutBranch {
  id: string;
  timeZone: string;
}

export interface TakeoutDish {
  id: string;
  branchId: string;
  name: string;
  price: Decimal;
  status: 'AVAILABLE' | 'SOLD_OUT' | 'DISABLED';
  categoryActive: boolean;
}

export interface TakeoutOrderLine {
  dishId: string;
  name: string;
  quantity: number;
  unitPrice: Decimal;
}

export interface TakeoutOrder {
  id: string;
  branchId: string;
  customerId: string | null;
  type: string;
  paymentMode: TakeoutPaymentMode | null;
  status: string;
  pickupAt: Date | null;
  timeZone: string;
  lines: TakeoutOrderLine[];
}

export interface CreateTakeoutOrder {
  operationId: string;
  branchId: string;
  customerId: string;
  paymentMode: TakeoutPaymentMode;
  status: 'PENDING' | 'PENDING_PAYMENT';
  pickupAt: Date;
  lines: TakeoutOrderLine[];
}
