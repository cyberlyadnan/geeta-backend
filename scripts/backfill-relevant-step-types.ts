/**
 * One-time backfill: tags existing ConfigurationField rows with the WorkflowStepType(s) their
 * answer matters to, using simple keyword matching on the field's code/label.
 *
 * This is a convenience seed, not the runtime mechanism — after this runs, the actual
 * highlighting logic (configuration-highlight.util.ts) only ever reads the tagged column, never
 * re-matches keywords. Admins can retag any field via the product configuration editor; this
 * script just gets existing products (Digital Printing, Wedding Cards, etc) working immediately
 * instead of starting blank.
 *
 * Idempotent and additive — only touches fields with an empty relevantStepTypes, and a keyword
 * can tag multiple step types if a field genuinely matters to more than one.
 *
 * Run with: npx tsx scripts/backfill-relevant-step-types.ts
 */
import { PrismaClient, WorkflowStepType } from '@prisma/client';

const prisma = new PrismaClient();

const KEYWORD_RULES: Array<{ stepType: WorkflowStepType; pattern: RegExp }> = [
  { stepType: WorkflowStepType.VERIFICATION, pattern: /verif|artwork/ },
  { stepType: WorkflowStepType.PRINTING, pattern: /\b(gsm|paper|print|ink|colou?r|side|sheet)\b/ },
  { stepType: WorkflowStepType.LAMINATION, pattern: /lamina/ },
  { stepType: WorkflowStepType.UV, pattern: /\buv\b/ },
  { stepType: WorkflowStepType.FOILING, pattern: /foil/ },
  { stepType: WorkflowStepType.DIE_CUTTING, pattern: /\b(cut|cutting|die)\b/ },
  { stepType: WorkflowStepType.PACKAGING, pattern: /pack/ },
  { stepType: WorkflowStepType.QUALITY_CHECK, pattern: /\b(quality|qc|inspect)\b/ },
];

function matchStepTypes(code: string, label: string): WorkflowStepType[] {
  const haystack = `${code} ${label}`.toLowerCase();
  const matches = KEYWORD_RULES.filter((rule) => rule.pattern.test(haystack)).map((rule) => rule.stepType);
  return [...new Set(matches)];
}

async function main() {
  const fields = await prisma.configurationField.findMany({
    where: { relevantStepTypes: { isEmpty: true } },
    select: { id: true, code: true, label: true },
  });

  console.log(`Checking ${fields.length} untagged fields`);

  let tagged = 0;
  for (const field of fields) {
    const stepTypes = matchStepTypes(field.code, field.label);
    if (stepTypes.length === 0) continue;

    await prisma.configurationField.update({
      where: { id: field.id },
      data: { relevantStepTypes: stepTypes },
    });
    tagged += 1;
    console.log(`  ${field.label} (${field.code}) -> ${stepTypes.join(', ')}`);
  }

  console.log(`Tagged ${tagged} of ${fields.length} fields. The rest had no keyword match — tag them manually if relevant.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
