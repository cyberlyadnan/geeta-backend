import type { Prisma, Role, VendorProfile } from '@prisma/client';
import { extractPermissions } from '../../modules/auth/auth.utils.js';

/** Fields safe to return from any authenticated API */
export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const satisfies Prisma.UserSelect;

export const USER_SUMMARY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const satisfies Prisma.UserSelect;

export const USER_ADMIN_LIST_SELECT = {
  ...USER_PUBLIC_SELECT,
} as const satisfies Prisma.UserSelect;

export const ROLE_PUBLIC_SELECT = {
  name: true,
  displayName: true,
  permissions: true,
} as const satisfies Prisma.RoleSelect;

export const VENDOR_PROFILE_PUBLIC_SELECT = {
  id: true,
  vendorCode: true,
  businessName: true,
  accountStatus: true,
  verificationRemarks: true,
  deliveryPreference: true,
} as const satisfies Prisma.VendorProfileSelect;

export const VENDOR_PROFILE_AUTH_SELECT = VENDOR_PROFILE_PUBLIC_SELECT;

/** Login only — password hash used server-side, never serialized to clients */
export const USER_LOGIN_SELECT = {
  ...USER_PUBLIC_SELECT,
  passwordHash: true,
  role: { select: ROLE_PUBLIC_SELECT },
  vendorProfile: { select: VENDOR_PROFILE_AUTH_SELECT },
} as const satisfies Prisma.UserSelect;

export const USER_SESSION_SELECT = {
  ...USER_PUBLIC_SELECT,
  role: { select: ROLE_PUBLIC_SELECT },
  vendorProfile: { select: VENDOR_PROFILE_AUTH_SELECT },
} as const satisfies Prisma.UserSelect;

export type UserPublicRecord = Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;
export type UserSummaryRecord = Prisma.UserGetPayload<{ select: typeof USER_SUMMARY_SELECT }>;
export type UserSessionRecord = Prisma.UserGetPayload<{ select: typeof USER_SESSION_SELECT }>;
export type UserLoginRecord = Prisma.UserGetPayload<{ select: typeof USER_LOGIN_SELECT }>;

export interface SafeUserSummaryDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface SafeUserPublicDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface SafeVendorProfileSummaryDto {
  id: string;
  vendorCode: string;
  businessName: string;
  accountStatus: VendorProfile['accountStatus'];
  verificationRemarks: string | null;
  deliveryPreference: VendorProfile['deliveryPreference'];
}

export interface SafeAuthUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: Role['name'];
  status: string;
  permissions: string[];
  vendorProfile: SafeVendorProfileSummaryDto | null;
}

const FORBIDDEN_USER_RESPONSE_KEYS = new Set([
  'passwordHash',
  'password_hash',
  'password',
  'refreshTokens',
  'refresh_tokens',
]);

/** Runtime guard — strips credential fields if a raw Prisma entity slips through */
export function stripForbiddenUserFields<T extends Record<string, unknown>>(record: T): Omit<T, 'passwordHash' | 'password'> {
  const copy = { ...record };
  for (const key of FORBIDDEN_USER_RESPONSE_KEYS) {
    if (key in copy) {
      delete copy[key];
    }
  }
  return copy as Omit<T, 'passwordHash' | 'password'>;
}

export function mapUserSummaryToDto(user: UserSummaryRecord | null | undefined): SafeUserSummaryDto | null {
  if (!user) return null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

export function mapUserPublicToDto(user: UserPublicRecord): SafeUserPublicDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export function mapVendorProfileSummaryToDto(
  profile: Pick<
    VendorProfile,
    'id' | 'vendorCode' | 'businessName' | 'accountStatus' | 'verificationRemarks' | 'deliveryPreference'
  > | null | undefined,
): SafeVendorProfileSummaryDto | null {
  if (!profile) return null;
  return {
    id: profile.id,
    vendorCode: profile.vendorCode,
    businessName: profile.businessName,
    accountStatus: profile.accountStatus,
    verificationRemarks: profile.verificationRemarks,
    deliveryPreference: profile.deliveryPreference,
  };
}

export function mapUserSessionToAuthDto(user: UserSessionRecord): SafeAuthUserDto {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    role: user.role.name,
    status: user.status,
    permissions: extractPermissions(user.role),
    vendorProfile: mapVendorProfileSummaryToDto(user.vendorProfile),
  };
}
