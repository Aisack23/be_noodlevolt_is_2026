import { LoyaltyAccrualError } from '../errors/loyalty-accrual.error.js';

interface LoyaltyAmount {
  isFinite(): boolean;
  isNegative(): boolean;
  floor(): {
    gt(value: number): boolean;
    toNumber(): number;
  };
}

export interface LoyaltyPayment {
  status: string;
  totalPaid: LoyaltyAmount;
  branchId: string;
  order: {
    customerId: string | null;
    customer: { role: string } | null;
    branchId: string;
    status: string;
  } | null;
}

export function calculatePoints(payment: LoyaltyPayment): number {
  const { order } = payment;
  if (
    payment.status !== 'PAID' ||
    !order?.customerId ||
    order.customer?.role !== 'CLIENT' ||
    order.status === 'CANCELED' ||
    order.branchId !== payment.branchId
  )
    return 0;

  if (!payment.totalPaid.isFinite() || payment.totalPaid.isNegative())
    throw new LoyaltyAccrualError();
  const points = payment.totalPaid.floor();
  if (points.gt(2147483647)) throw new LoyaltyAccrualError();
  return points.toNumber();
}
