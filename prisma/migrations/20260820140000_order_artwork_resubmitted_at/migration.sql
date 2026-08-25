-- Distinguishes "fresh artwork awaiting first review" from "vendor resubmitted after a
-- revision request" — both previously collapsed onto approval_status = PENDING, which made
-- brand-new orders show up in the verifier queue as if changes had been made. Additive only.
ALTER TABLE "order_artworks"
  ADD COLUMN "resubmitted_at" TIMESTAMP(3);
