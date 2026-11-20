ALTER TABLE "reviews"
    ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);