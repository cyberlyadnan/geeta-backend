import { prisma } from '../src/config/database.js';

async function main() {
  console.log('=== DEPARTMENTS ===');
  const depts = await prisma.department.findMany({
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, isActive: true },
  });
  for (const d of depts) console.log(`  ${d.code.padEnd(24)} ${d.name.padEnd(30)} active=${d.isActive}`);

  console.log('\n=== WORKFLOW TEMPLATES + STEPS ===');
  const templates = await prisma.workflowTemplate.findMany({
    include: { steps: { orderBy: { stepOrder: 'asc' }, include: { department: { select: { code: true } } } } },
  });
  for (const t of templates) {
    console.log(`  Template: ${t.name}  active=${t.isActive}`);
    for (const s of t.steps) {
      console.log(`    ${String(s.stepOrder).padStart(2)}. ${s.stepCode.padEnd(26)} dept=${(s.department?.code ?? 'NONE').padEnd(24)} type=${s.stepType}`);
    }
  }

  console.log('\n=== STAFF PER DEPARTMENT ===');
  for (const d of depts) {
    const members = await prisma.userDepartmentAssignment.findMany({
      where: { departmentId: d.id },
      include: { user: { select: { email: true, firstName: true, lastName: true, status: true, role: { select: { name: true } } } } },
    });
    const tag = members.length === 0 ? '  <-- NO STAFF' : '';
    console.log(`  ${d.code.padEnd(24)} ${members.length} member(s)${tag}`);
    for (const m of members) {
      console.log(`      - ${m.user.email.padEnd(34)} ${m.user.role.name.padEnd(12)} status=${m.user.status}`);
    }
  }

  console.log('\n=== ROLES ===');
  const roles = await prisma.role.findMany({ select: { name: true, _count: { select: { users: true } } } });
  for (const r of roles) console.log(`  ${r.name.padEnd(16)} ${r._count.users} user(s)`);

  console.log('\n=== DELIVERY SHIFTS ===');
  const shifts = await prisma.deliveryShift.findMany({ orderBy: { cutoffTime: 'asc' } });
  for (const s of shifts) console.log(`  ${s.name.padEnd(24)} cutoff=${s.cutoffTime} active=${s.isActive}`);
}
main().catch((e) => console.error('ERR', e)).finally(() => prisma.$disconnect());
