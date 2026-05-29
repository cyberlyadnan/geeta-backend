import { Prisma } from '@prisma/client';

export function toDecimal(value: number | string | Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export function decimalToNumber(value: Prisma.Decimal): number {
  return value.toNumber();
}

export function formatInr(amount: number | Prisma.Decimal): string {
  const n = typeof amount === 'number' ? amount : amount.toNumber();
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

export function paiseFromRupees(rupees: number): number {
  return Math.round(rupees * 100);
}

export function rupeesFromPaise(paise: number): number {
  return paise / 100;
}
