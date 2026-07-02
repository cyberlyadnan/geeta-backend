import type { RoleName, VendorAccountStatus } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface VendorProfileSummary {
  id: string;
  vendorCode: string;
  businessName: string;
  accountStatus: VendorAccountStatus;
  verificationRemarks: string | null;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: RoleName;
  status: string;
  permissions: string[];
  vendorProfile?: VendorProfileSummary | null;
}

export interface LoginResponse {
  user: AuthUserResponse;
  tokens: AuthTokens;
}

export interface VendorRegisterResponse {
  message: string;
  vendorProfileId: string;
  vendorCode: string;
  accountStatus: VendorAccountStatus;
}
