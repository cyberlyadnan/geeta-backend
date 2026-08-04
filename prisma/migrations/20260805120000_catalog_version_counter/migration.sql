-- Single-row catalog version counter. Bumped atomically on every admin catalog write so vendor
-- clients can detect staleness with one primary-key read instead of nine aggregates.
CREATE TABLE "catalog_versions" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "version" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "catalog_versions_pkey" PRIMARY KEY ("id")
);

INSERT INTO "catalog_versions" ("id", "version", "updated_at") VALUES (1, 1, CURRENT_TIMESTAMP);
