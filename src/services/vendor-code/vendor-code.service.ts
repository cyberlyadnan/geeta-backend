import type { Prisma } from '@prisma/client';
import { ApiError } from '../../common/errors/ApiError.js';
import {
  formatVendorCode,
  VENDOR_CODE_SEQUENCE_START,
} from '../../constants/vendor-code.js';

type TransactionClient = Prisma.TransactionClient;

export class VendorCodeService {
  /**
   * Atomically reserves the next vendor member ID (GP1001, GP1002, …).
   * Must run inside a Prisma transaction.
   */
  async allocateNext(tx: TransactionClient): Promise<string> {
    await tx.vendorCodeSequence.upsert({
      where: { id: 1 },
      create: { id: 1, lastValue: VENDOR_CODE_SEQUENCE_START },
      update: {},
    });

    const rows = await tx.$queryRaw<{ last_value: number }[]>`
      UPDATE vendor_code_sequences
      SET last_value = last_value + 1
      WHERE id = 1
      RETURNING last_value
    `;

    const next = rows[0]?.last_value;
    if (next == null || next <= VENDOR_CODE_SEQUENCE_START) {
      throw ApiError.internal('Failed to allocate vendor member ID');
    }

    return formatVendorCode(next);
  }
}

export const vendorCodeService = new VendorCodeService();
