ALTER TABLE "reservations"
  ADD COLUMN "canceled_at" TIMESTAMPTZ(6),
  ADD COLUMN "canceled_by" UUID,
  ADD CONSTRAINT "reservations_canceled_by_fkey"
    FOREIGN KEY ("canceled_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
