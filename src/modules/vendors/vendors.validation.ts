import { z } from 'zod';

export const vendorStatusByPhoneSchema = z.object({
  phone: z
    .string()
    .transform((v) => v.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[6-9]\d{9}$/)),
});
