import type { RoleName } from '@prisma/client';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUserResponse {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: RoleName;
}

export interface LoginResponse {
  user: AuthUserResponse;
  tokens: AuthTokens;
}
