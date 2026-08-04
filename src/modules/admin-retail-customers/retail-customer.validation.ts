import { z } from 'zod';

export const lookupRetailCustomerQuerySchema = z.object({
  phone: z.string().min(1),
});

export const createRetailCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  hasGst: z.boolean().optional(),
  gstNumber: z.string().max(30).optional(),
});

export type LookupRetailCustomerQuery = z.infer<typeof lookupRetailCustomerQuerySchema>;
export type CreateRetailCustomerInput = z.infer<typeof createRetailCustomerSchema>;
