-- AlterTable
ALTER TABLE "workflow_template_steps" ADD COLUMN "job_slip_before_this_step" BOOLEAN NOT NULL DEFAULT false;

-- One stop per template. Prefer Dispatch, then QC, then Packaging so existing
-- flows keep printing the slip on the department just before that stop.
UPDATE "workflow_template_steps" AS target
SET "job_slip_before_this_step" = true
FROM (
  SELECT DISTINCT ON ("workflow_template_id") id
  FROM "workflow_template_steps"
  WHERE "step_type" IN ('DISPATCH', 'QUALITY_CHECK', 'PACKAGING')
  ORDER BY
    "workflow_template_id",
    CASE "step_type"
      WHEN 'DISPATCH' THEN 1
      WHEN 'QUALITY_CHECK' THEN 2
      WHEN 'PACKAGING' THEN 3
    END,
    "step_order" ASC
) AS chosen
WHERE target.id = chosen.id;
