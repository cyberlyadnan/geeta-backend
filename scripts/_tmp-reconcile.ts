import { prisma } from '../src/config/database.js';
import { assignmentService } from '../src/modules/production/assignment/assignment.service.js';

async function main() {
  const stranded = await prisma.workflowTask.findMany({
    where: {
      status: 'READY',
      assignments: { none: { status: 'ACTIVE' } },
      workflowInstance: { status: { in: ['RUNNING', 'INITIALIZED'] } },
    },
    select: { id: true, department: { select: { code: true } } },
  });
  console.log(`Found ${stranded.length} stranded READY tasks — attempting auto-assign…`);
  for (const t of stranded) {
    try {
      await assignmentService.tryAutoAssignReadyTask(t.id);
      console.log(`  OK   ${(t.department?.code ?? '-').padEnd(18)} ${t.id}`);
    } catch (e: any) {
      console.log(`  FAIL ${(t.department?.code ?? '-').padEnd(18)} ${t.id}: ${e.message}`);
    }
  }
  console.log('Done.');
}
main().catch((e) => console.error('ERR', e?.message)).finally(() => prisma.$disconnect());
