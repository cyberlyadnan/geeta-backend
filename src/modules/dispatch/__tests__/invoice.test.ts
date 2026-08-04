import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import type { Prisma } from '@prisma/client';
import { allocateInvoiceNumber } from '../invoice-number.service.js';
import { buildInvoicePdf, type InvoicePayload } from '../invoice-pdf.service.js';

/** Stands in for the sequence row, including the row-lock serialisation the real upsert gives. */
function createSequenceTx() {
  const rows = new Map<number, number>();
  let upsertCount = 0;

  const tx = {
    invoiceNumberSequence: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { year: number };
        create: { year: number; lastValue: number };
        update: { lastValue: { increment: number } };
      }) => {
        upsertCount += 1;
        const current = rows.get(where.year);
        const next = current === undefined ? create.lastValue : current + update.lastValue.increment;
        rows.set(where.year, next);
        return { year: where.year, lastValue: next };
      },
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, rows, getUpsertCount: () => upsertCount };
}

describe('allocateInvoiceNumber — sequential and gapless', () => {
  it('produces INV-YYYY-NNNNNN starting at 1', async () => {
    const { tx } = createSequenceTx();
    const first = await allocateInvoiceNumber(tx, new Date(2026, 0, 15));
    assert.equal(first, 'INV-2026-000001');
  });

  it('increments by exactly one with no gaps across a run', async () => {
    const { tx } = createSequenceTx();
    const now = new Date(2026, 0, 15);
    const numbers: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      numbers.push(await allocateInvoiceNumber(tx, now));
    }

    assert.deepEqual(numbers, [
      'INV-2026-000001',
      'INV-2026-000002',
      'INV-2026-000003',
      'INV-2026-000004',
      'INV-2026-000005',
    ]);
    assert.equal(new Set(numbers).size, 5, 'every number is unique');
  });

  it('restarts numbering per calendar year', async () => {
    const { tx } = createSequenceTx();
    await allocateInvoiceNumber(tx, new Date(2026, 11, 31));
    const nextYear = await allocateInvoiceNumber(tx, new Date(2027, 0, 1));
    assert.equal(nextYear, 'INV-2027-000001');
  });

  it('keeps the number within the 16-character GST limit', async () => {
    const { tx } = createSequenceTx();
    const number = await allocateInvoiceNumber(tx, new Date(2026, 0, 1));
    assert.ok(number.length <= 16, `${number} is ${number.length} chars`);
    assert.match(number, /^[A-Za-z0-9/-]+$/, 'only GST-permitted characters');
  });

  it('pads to six digits so numbers sort lexicographically', async () => {
    const { tx, rows } = createSequenceTx();
    rows.set(2026, 41);
    const number = await allocateInvoiceNumber(tx, new Date(2026, 0, 1));
    assert.equal(number, 'INV-2026-000042');
  });
});

const PAYLOAD: InvoicePayload = {
  invoiceNumber: 'INV-2026-000042',
  invoiceDate: '2026-08-04',
  billedToName: 'Ravi Prints',
  gstNumber: '27AAAAA0000A1Z5',
  shiftLabel: '2:00 PM',
  dispatchDate: '2026-08-04',
  lines: [
    { orderNumber: 'GP-2026-000041', description: 'Business cards', quantity: 100, amount: 1200 },
    { orderNumber: 'GP-2026-000042', description: 'Letterheads', quantity: 50, amount: 800 },
  ],
  subtotal: 2000,
  deliveryCharge: 150,
  gstRate: 0.18,
  gstAmount: 387,
  total: 2537,
};

/**
 * Extracts the visible text from a generated PDF so the assertions below check what a human
 * would actually see on the invoice, not merely that bytes were produced.
 *
 * Two layers to get through: pdf-lib Flate-compresses its content streams, and inside them
 * pdf-lib writes show-text operands as hex strings (`<4745455441...> Tj`). So: inflate every
 * stream, then decode the hex operands back to characters.
 */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const streamStart = Buffer.from('\nstream', 'latin1');
  const streamEnd = Buffer.from('endstream', 'latin1');

  let inflated = '';
  let cursor = 0;
  for (;;) {
    const start = raw.indexOf(streamStart, cursor);
    if (start === -1) break;
    const end = raw.indexOf(streamEnd, start);
    if (end === -1) break;

    let dataStart = start + streamStart.length;
    if (raw[dataStart] === 0x0d) dataStart += 1;
    if (raw[dataStart] === 0x0a) dataStart += 1;

    try {
      inflated += inflateSync(raw.subarray(dataStart, end)).toString('latin1');
    } catch {
      // Not a Flate stream — skip it and keep scanning.
    }
    cursor = end + streamEnd.length;
  }

  return inflated.replace(/<([0-9A-Fa-f]+)>/g, (_match, hex: string) =>
    Buffer.from(hex, 'hex').toString('latin1'),
  );
}

describe('buildInvoicePdf — document contents', () => {
  it('produces a valid PDF', async () => {
    const bytes = await buildInvoicePdf(PAYLOAD);
    assert.ok(bytes.byteLength > 500);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), '%PDF-');
  });

  it('includes every order in the batch as its own line', async () => {
    const text = pdfText(await buildInvoicePdf(PAYLOAD));
    for (const line of PAYLOAD.lines) {
      assert.ok(text.includes(line.orderNumber), `${line.orderNumber} is missing from the invoice`);
    }
  });

  it('includes the delivery charge as its own labelled line', async () => {
    const text = pdfText(await buildInvoicePdf(PAYLOAD));
    assert.ok(text.includes('Delivery charge'), 'delivery is not a separate line');
    assert.ok(text.includes('150.00'), 'the delivery amount is not printed');
  });

  it('prints the GST breakdown and the total', async () => {
    const text = pdfText(await buildInvoicePdf(PAYLOAD));
    assert.ok(text.includes('GST @ 18%'), 'GST rate is not shown');
    assert.ok(text.includes('387.00'), 'GST amount is not shown');
    assert.ok(text.includes('2,537.00'), 'total is not shown');
  });

  it('prints the invoice number and the billed party with their GSTIN', async () => {
    const text = pdfText(await buildInvoicePdf(PAYLOAD));
    assert.ok(text.includes('INV-2026-000042'));
    assert.ok(text.includes('Ravi Prints'));
    assert.ok(text.includes('27AAAAA0000A1Z5'));
  });

  it('marks an unregistered retail customer rather than printing a blank GSTIN', async () => {
    const text = pdfText(await buildInvoicePdf({ ...PAYLOAD, gstNumber: null, billedToName: 'Walk-in Anita' }));
    assert.ok(text.includes('Unregistered'));
    assert.ok(text.includes('Walk-in Anita'));
  });

  it('renders amounts without the rupee glyph, which StandardFonts cannot encode', async () => {
    const bytes = await buildInvoicePdf(PAYLOAD);
    const text = pdfText(bytes);
    assert.ok(text.includes('Rs.'), 'amounts should be prefixed Rs.');
    assert.ok(!Buffer.from(bytes).includes(Buffer.from('₹', 'utf8')), 'no raw rupee sign');
  });

  it('groups large amounts in the Indian convention', async () => {
    const text = pdfText(
      await buildInvoicePdf({ ...PAYLOAD, subtotal: 1234567, total: 1234567, gstAmount: 0, deliveryCharge: 0 }),
    );
    assert.ok(text.includes('12,34,567.00'), 'expected Indian digit grouping');
  });

  it('does not throw on a batch large enough to need a second page', async () => {
    const manyLines = Array.from({ length: 60 }, (_, i) => ({
      orderNumber: `GP-2026-${String(i).padStart(6, '0')}`,
      description: 'Business cards',
      quantity: 10,
      amount: 100,
    }));
    const bytes = await buildInvoicePdf({ ...PAYLOAD, lines: manyLines });
    assert.ok(bytes.byteLength > 1000);
    assert.ok(pdfText(bytes).includes('GP-2026-000059'), 'later lines still render');
  });

  it('renders a single-order batch', async () => {
    const bytes = await buildInvoicePdf({ ...PAYLOAD, lines: [PAYLOAD.lines[0]!] });
    assert.ok(pdfText(bytes).includes('GP-2026-000041'));
  });
});
