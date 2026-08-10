/**
 * Creates one operator per production department that has no staff, plus default delivery
 * shifts if none exist.
 *
 * A workflow step whose department has nobody assigned cannot auto-assign its task, so the
 * order silently stalls there. Running this makes every step in the Digital Printing workflow
 * actionable end to end. Safe to re-run: existing users and assignments are left alone.
 */
import { prisma } from '../src/config/database.js';
import { passwordService } from '../src/services/auth/password.service.js';

const DEFAULT_PASSWORD = 'Geeta@12345';

const STAFF: Array<{ dept: string; first: string; last: string; email: string }> = [
  { dept: 'CUTTING_FULL_CUT', first: 'Imran', last: 'Cutting', email: 'cutting.full@geetaprint.test' },
  { dept: 'CUTTING_HALF_CUT', first: 'Rashid', last: 'HalfCut', email: 'cutting.half@geetaprint.test' },
  { dept: 'QC', first: 'Nadeem', last: 'Quality', email: 'qc@geetaprint.test' },
  { dept: 'PACKING', first: 'Salman', last: 'Packing', email: 'packing@geetaprint.test' },
  { dept: 'DISPATCH', first: 'Rizwan', last: 'Dispatch', email: 'dispatch@geetaprint.test' },
  { dept: 'PRINTING', first: 'Adil', last: 'Printing', email: 'printing@geetaprint.test' },
  { dept: 'DESIGN', first: 'Zaid', last: 'Design', email: 'design@geetaprint.test' },
];

async function main() {
  const staffRole = await prisma.role.findFirst({ where: { name: 'STAFF' } });
  if (!staffRole) throw new Error('STAFF role missing');
  const admin = await prisma.user.findFirst({ where: { role: { name: 'SUPER_ADMIN' } }, select: { id: true } });

  const passwordHash = await passwordService.hash(DEFAULT_PASSWORD);
  const created: string[] = [];

  for (const s of STAFF) {
    const dept = await prisma.department.findFirst({ where: { code: s.dept }, select: { id: true, name: true } });
    if (!dept) { console.log(`SKIP ${s.dept} — department not found`); continue; }

    const existing = await prisma.userDepartmentAssignment.findFirst({ where: { departmentId: dept.id } });
    if (existing) { console.log(`OK   ${s.dept.padEnd(20)} already staffed`); continue; }

    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: {
        email: s.email,
        firstName: s.first,
        lastName: s.last,
        passwordHash,
        roleId: staffRole.id,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.userDepartmentAssignment.create({
      data: {
        userId: user.id,
        departmentId: dept.id,
        roleCode: 'OPERATOR',
        isPrimary: true,
        isActive: true,
        assignedById: admin?.id,
      },
    });
    created.push(`${s.email}  ->  ${s.dept}`);
    console.log(`NEW  ${s.dept.padEnd(20)} ${s.email}`);
  }

  // Delivery shifts — dispatch cannot schedule a delivery without at least one.
  const shiftCount = await prisma.deliveryShift.count();
  if (shiftCount === 0) {
    await prisma.deliveryShift.createMany({
      data: [
        { label: 'Morning (by 12 PM)', cutoffTime: '12:00', sortOrder: 1, isActive: true },
        { label: 'Evening (by 6 PM)', cutoffTime: '18:00', sortOrder: 2, isActive: true },
      ],
    });
    console.log('NEW  delivery shifts: Morning, Evening');
  } else {
    console.log(`OK   delivery shifts already configured (${shiftCount})`);
  }

  console.log('\n=== CREDENTIALS (all newly created users) ===');
  console.log(`password: ${DEFAULT_PASSWORD}`);
  for (const c of created) console.log('  ' + c);
  if (created.length === 0) console.log('  (nothing new — every department already had staff)');
}
main().catch((e) => console.error('ERR', e)).finally(() => prisma.$disconnect());
