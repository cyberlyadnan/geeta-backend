import { z } from 'zod';
import { normalizeIndianPhone } from './auth.utils.js';

const phoneSchema = z
  .string()
  .transform((v) => normalizeIndianPhone(v))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));

const registrationServiceIds = z.enum([
  'uv_printing',
  'digital_printing',
  'offset_printing',
  'flex_printing',
]);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
});

export const vendorRegisterSchema = z.object({
  businessName: z.string().min(2).max(200),
  yourName: z.string().min(2).max(120),
  whatsapp: phoneSchema,
  email: z.string().email(),
  password: z.string().min(8).max(128),
  referenceCode: z.string().max(50).optional(),
  employeeCode: z.string().max(50).optional(),
  country: z.string().min(1).max(100),
  pinCode: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
  gstNumber: z.string().max(20).optional(),
  fullAddress: z.string().min(10).max(2000),
  services: z.array(registrationServiceIds).min(1),
  deliveryPreference: z
    .enum(['ALWAYS_DELIVERY_REQUIRED', 'SELF_PICKUP_ONLY', 'ASK_ON_EVERY_ORDER'])
    .default('ASK_ON_EVERY_ORDER'),
});

export const loginSchema = z.union([
  z.object({
    phone: phoneSchema,
    password: z.string().min(1),
  }),
  z.object({
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(1),
  }),
]);

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
      'Password must contain at least 1 letter, 1 number, and 1 special character',
    ),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type VendorRegisterInput = z.infer<typeof vendorRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
