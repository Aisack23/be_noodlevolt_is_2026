ALTER TABLE "reservations"
  DROP CONSTRAINT "reservations_canceled_by_fkey",
  DROP COLUMN "canceled_by",
  DROP COLUMN "canceled_at";
