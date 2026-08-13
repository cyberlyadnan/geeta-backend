import { z } from 'zod';

export const updateCompanyProfileSchema = z.object({
  companyName: z.string().max(200).optional(),
  tagline: z.string().max(300).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  stateCode: z.string().max(10).optional(),
  pincode: z.string().max(10).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().max(200).optional(),
  website: z.string().max(200).optional(),
  gstin: z.string().max(20).optional(),
  pan: z.string().max(15).optional(),
  cin: z.string().max(25).optional(),
  bankName: z.string().max(200).optional(),
  bankAccount: z.string().max(30).optional(),
  bankIfsc: z.string().max(15).optional(),
  bankBranch: z.string().max(200).optional(),
  terms: z.string().max(2000).optional(),
});

export type UpdateCompanyProfileInput = z.infer<typeof updateCompanyProfileSchema>;
