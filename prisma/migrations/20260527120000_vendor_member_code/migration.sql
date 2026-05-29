-- Vendor member IDs: GP1001, GP1002, …

CREATE TABLE "vendor_code_sequences" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "last_value" INTEGER NOT NULL DEFAULT 1000,
    CONSTRAINT "vendor_code_sequences_pkey" PRIMARY KEY ("id")
);

INSERT INTO "vendor_code_sequences" ("id", "last_value") VALUES (1, 1000);

ALTER TABLE "vendor_profiles" ADD COLUMN "vendor_code" TEXT;

WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at" ASC) AS rn
    FROM "vendor_profiles"
)
UPDATE "vendor_profiles" AS vp
SET "vendor_code" = 'GP' || (1000 + numbered.rn)::TEXT
FROM numbered
WHERE vp."id" = numbered."id";

UPDATE "vendor_code_sequences"
SET "last_value" = COALESCE(
    (
        SELECT MAX(CAST(SUBSTRING("vendor_code" FROM 3) AS INTEGER))
        FROM "vendor_profiles"
        WHERE "vendor_code" IS NOT NULL
    ),
    1000
);

ALTER TABLE "vendor_profiles" ALTER COLUMN "vendor_code" SET NOT NULL;

CREATE UNIQUE INDEX "vendor_profiles_vendor_code_key" ON "vendor_profiles"("vendor_code");
CREATE INDEX "vendor_profiles_vendor_code_idx" ON "vendor_profiles"("vendor_code");
