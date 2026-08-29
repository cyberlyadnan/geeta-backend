import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/** No 0/O/1/I — these codes get read out over the phone. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSuffix(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[(bytes[i] ?? 0) % ALPHABET.length];
  }
  return out;
}

/**
 * Allocates a referral code a partner can hand to a new vendor.
 *
 * Derived from the business name so it is recognisable ("GEETA-K7M2"), with a random tail so it
 * cannot be guessed from the name alone. Retries on collision rather than trusting the first draw.
 */
export async function allocatePartnerCode(
  tx: Prisma.TransactionClient,
  businessName: string,
): Promise<string> {
  const base =
    businessName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 5) || 'PARTNER';

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `${base}-${randomSuffix(4)}`;
    const clash = await tx.channelPartnerProfile.findUnique({ where: { partnerCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  // Exhausting eight attempts means something is very wrong with the random source; fall back to
  // a long code rather than looping forever.
  return `${base}-${randomSuffix(10)}`;
}
