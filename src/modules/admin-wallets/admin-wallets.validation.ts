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

export const adminWalletDetailQuerySchema = z.object({
  transactionsPage: z.coerce.number().int().min(1).default(1),
  paymentsPage: z.coerce.number().int().min(1).default(1),
  auditsPage: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export type AdminWalletAdjustInput = z.infer<typeof adminWalletAdjustSchema>;
export type ListAdminWalletsQuery = z.infer<typeof listAdminWalletsQuerySchema>;
export type AdminWalletDetailQuery = z.infer<typeof adminWalletDetailQuerySchema>;
