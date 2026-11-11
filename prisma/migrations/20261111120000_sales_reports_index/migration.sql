CREATE INDEX "payments_paid_branch_id_created_at_idx"
  ON "payments" ("branch_id", "created_at")
  INCLUDE ("total_paid", "order_id")
  WHERE "status" = 'PAID';
