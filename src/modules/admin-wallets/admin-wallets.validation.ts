import { z } from 'zod';

export const userIdParamSchema = z.object({
  userId: z.string().min(1),
});

export const adminWalletAdjustSchema = z.object({
  userId: z.string().min(1),
  amount: z.coerce.number().positive(),
  remarks: z.string().min(2).max(2000),
});

export const listAdminWalletsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

export type AdminWalletAdjustInput = z.infer<typeof adminWalletAdjustSchema>;
export type ListAdminWalletsQuery = z.infer<typeof listAdminWalletsQuerySchema>;
