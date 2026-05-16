import { RoleName, UserStatus } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { passwordService, tokenService } from '../../services/auth/index.js';
import { parseDurationToMs } from '../../utils/time.js';
import { jwtConfig } from '../../config/jwt.js';
import type { LoginInput, RegisterInput } from './auth.validation.js';
import type { AuthTokens, LoginResponse } from './auth.types.js';
import { extractPermissions, mapUserToAuthResponse } from './auth.utils.js';

export class AuthService {
  async register(input: RegisterInput): Promise<LoginResponse> {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw ApiError.conflict('Email already registered');
    }

    const customerRole = await prisma.role.findUnique({
      where: { name: RoleName.CUSTOMER },
    });

    if (!customerRole) {
      throw ApiError.internal('Default role not configured. Run database seed.');
    }

    const passwordHash = await passwordService.hash(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleId: customerRole.id,
        status: UserStatus.PENDING_VERIFICATION,
        wallet: { create: {} },
      },
      include: { role: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return { user: mapUserToAuthResponse(user), tokens };
  }

  async login(input: LoginInput): Promise<LoginResponse> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { role: true },
    });

    if (!user || user.deletedAt) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE) {
      throw ApiError.forbidden('Account is not active');
    }

    const valid = await passwordService.compare(input.password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return { user: mapUserToAuthResponse(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = tokenService.verifyRefreshToken(refreshToken);

    const stored = await prisma.refreshToken.findFirst({
      where: {
        token: refreshToken,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: { include: { role: true } } },
    });

    if (!stored) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(stored.user.id, stored.user.email, stored.user.role);
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: { name: RoleName; permissions: unknown },
  ): Promise<AuthTokens> {
    const permissions = extractPermissions(role as import('@prisma/client').Role);

    const accessToken = tokenService.generateAccessToken({
      id: userId,
      email,
      role: role.name,
      permissions,
    });

    const refreshToken = tokenService.generateRefreshToken({
      id: userId,
      email,
      role: role.name,
    });

    const expiresAt = new Date(Date.now() + parseDurationToMs(jwtConfig.refreshExpiresIn));

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}

export const authService = new AuthService();
