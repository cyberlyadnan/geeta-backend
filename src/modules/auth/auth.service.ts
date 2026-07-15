import {
  ActivityAction,
  DeliveryPreference,
  RoleName,
  UserStatus,
  VendorAccountStatus,
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { ApiError } from '../../common/errors/ApiError.js';
import { TtlCache } from '../../common/cache/ttl-cache.js';
import { passwordService, tokenService } from '../../services/auth/index.js';
import { activityLogService } from '../../services/activity/index.js';
import { vendorCodeService } from '../../services/vendor-code/index.js';
import { parseDurationToMs } from '../../utils/time.js';
import { jwtConfig } from '../../config/jwt.js';
import { userRepository } from '../../repositories/user.repository.js';
import { roleRepository } from '../../repositories/role.repository.js';
import type {
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  VendorRegisterInput,
} from './auth.validation.js';
import type {
  AuthTokens,
  LoginResponse,
  VendorRegisterResponse,
} from './auth.types.js';
import { resolveSupportContact } from '../../config/business-contact.js';
import {
  USER_SESSION_SELECT,
} from '../../common/security/user.serialization.js';
import { extractPermissions, mapUserToAuthResponse, splitOwnerName } from './auth.utils.js';
const authMeCaches = new Map<string, TtlCache<ReturnType<typeof mapUserToAuthResponse>>>();

function authMeCacheFor(userId: string) {
  let cache = authMeCaches.get(userId);
  if (!cache) {
    cache = new TtlCache(Number(process.env['AUTH_ME_CACHE_TTL_MS'] ?? 10_000));
    authMeCaches.set(userId, cache);
  }
  return cache;
}

export class AuthService {
  async registerVendor(
    input: VendorRegisterInput,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<VendorRegisterResponse> {
    const phone = input.whatsapp;

    const [existingEmail, existingPhone] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email.toLowerCase() } }),
      prisma.user.findUnique({ where: { phone } }),
    ]);

    if (existingEmail) {
      throw ApiError.conflict('Email is already registered');
    }
    if (existingPhone) {
      throw ApiError.conflict('Mobile number is already registered');
    }

    const vendorRole = await roleRepository.findByName(RoleName.VENDOR);
    if (!vendorRole) {
      throw ApiError.internal('Vendor role not configured. Run database seed.');
    }

    const { firstName, lastName } = splitOwnerName(input.yourName);
    const passwordHash = await passwordService.hash(input.password);

    const user = await prisma.$transaction(async (tx) => {
      const vendorCode = await vendorCodeService.allocateNext(tx);
      return tx.user.create({
        data: {
          email: input.email.toLowerCase(),
          passwordHash,
          firstName,
          lastName,
          phone,
          roleId: vendorRole.id,
          status: UserStatus.PENDING_VERIFICATION,
          vendorProfile: {
            create: {
              vendorCode,
              businessName: input.businessName,
              ownerName: input.yourName,
              gstNumber: input.gstNumber || null,
              referenceCode: input.referenceCode || null,
              employeeCode: input.employeeCode || null,
              country: input.country,
              pinCode: input.pinCode,
              fullAddress: input.fullAddress,
              services: input.services,
              deliveryPreference: input.deliveryPreference as DeliveryPreference,
              accountStatus: VendorAccountStatus.PENDING,
            },
          },
        },
        include: { vendorProfile: true },
      });
    });

    if (!user.vendorProfile) {
      throw ApiError.internal('Vendor profile creation failed');
    }

    activityLogService.logAsync({
      action: ActivityAction.VENDOR_REGISTERED,
      entityType: 'vendor_profile',
      entityId: user.vendorProfile.id,
      vendorProfileId: user.vendorProfile.id,
      actorId: user.id,
      metadata: {
        businessName: input.businessName,
        phone,
        email: input.email,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      message:
        'Registration submitted successfully. Your account is pending admin verification.',
      vendorProfileId: user.vendorProfile.id,
      vendorCode: user.vendorProfile.vendorCode,
      accountStatus: VendorAccountStatus.PENDING,
    };
  }

  async register(input: RegisterInput): Promise<LoginResponse> {
    const [existing, customerRole] = await Promise.all([
      prisma.user.findUnique({ where: { email: input.email } }),
      roleRepository.findByName(RoleName.CUSTOMER),
    ]);
    if (existing) {
      throw ApiError.conflict('Email already registered');
    }
    if (!customerRole) {
      throw ApiError.internal('Default role not configured. Run database seed.');
    }

    const passwordHash = await passwordService.hash(input.password);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        roleId: customerRole.id,
        status: UserStatus.PENDING_VERIFICATION,
        wallet: { create: {} },
      },
      select: USER_SESSION_SELECT,
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);
    return { user: mapUserToAuthResponse(user), tokens };
  }

  async login(input: LoginInput, meta?: { ipAddress?: string; userAgent?: string }): Promise<LoginResponse> {
    const where =
      'email' in input
        ? { email: input.email.toLowerCase(), deletedAt: null }
        : { phone: input.phone, deletedAt: null };

    const user = await userRepository.findForLogin(where);

    if (!user) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    const valid = await passwordService.compare(input.password, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Invalid credentials');
    }

    if (user.role.name === RoleName.VENDOR) {
      await this.assertVendorCanLogin(user);
    } else if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.INACTIVE) {
      throw ApiError.forbidden('Account is not active');
    }

    const tokens = await this.issueTokensWithLoginUpdate(user.id, user.email, user.role);

    activityLogService.logAsync({
        action: ActivityAction.USER_LOGIN,
        entityType: 'user',
        entityId: user.id,
        vendorProfileId: user.vendorProfile?.id,
        actorId: user.id,
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });

    return { user: mapUserToAuthResponse(user), tokens };
  }

  private async assertVendorCanLogin(
    user: {
      id: string;
      vendorProfile: {
        id: string;
        accountStatus: VendorAccountStatus;
        verificationRemarks: string | null;
      } | null;
    },
  ): Promise<void> {
    const profile = user.vendorProfile;
    if (!profile) {
      throw ApiError.forbidden('Vendor profile not found', 'VENDOR_PROFILE_MISSING');
    }

    const support = resolveSupportContact();

    switch (profile.accountStatus) {
      case VendorAccountStatus.PENDING:
      case VendorAccountStatus.UNDER_REVIEW:
      case VendorAccountStatus.DOCUMENT_REQUIRED:
        activityLogService.logAsync({
          action: ActivityAction.USER_LOGIN_BLOCKED,
          entityType: 'vendor_profile',
          entityId: profile.id,
          vendorProfileId: profile.id,
          actorId: user.id,
          metadata: { reason: profile.accountStatus },
        });
        throw ApiError.forbidden(
          'Your account is currently under verification by the administration team. You will be able to access your dashboard once your account is approved.',
          'VENDOR_PENDING_VERIFICATION',
          { ...support, accountStatus: profile.accountStatus },
        );
      case VendorAccountStatus.REJECTED:
        throw ApiError.forbidden(
          profile.verificationRemarks ??
            'Your registration was not approved. Please contact support for assistance.',
          'VENDOR_REJECTED',
          {
            ...support,
            accountStatus: profile.accountStatus,
            remarks: profile.verificationRemarks,
          },
        );
      case VendorAccountStatus.SUSPENDED:
      case VendorAccountStatus.BLOCKED:
        throw ApiError.forbidden(
          'Your account has been suspended. Please contact support.',
          'VENDOR_SUSPENDED',
          { ...support, accountStatus: profile.accountStatus },
        );
      case VendorAccountStatus.VERIFIED:
        return;
      default:
        throw ApiError.forbidden('Account cannot login at this time', 'VENDOR_LOGIN_DENIED', support);
    }
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
      select: {
        id: true,
        user: { select: USER_SESSION_SELECT },
      },
    });

    if (!stored) {
      throw ApiError.unauthorized('Invalid refresh token');
    }

    if (stored.user.role.name === RoleName.VENDOR) {
      await this.assertVendorCanLogin(stored.user);
    }

    const tokens = this.buildTokenPair(stored.user.id, stored.user.email, stored.user.role);
    const expiresAt = new Date(Date.now() + parseDurationToMs(jwtConfig.refreshExpiresIn));

    await prisma.$transaction([
      prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId: stored.user.id,
          expiresAt,
        },
      }),
    ]);

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<{ success: true }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const valid = await passwordService.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    if (input.newPassword === input.currentPassword) {
      throw ApiError.badRequest('New password must be different from the current password');
    }

    const passwordHash = await passwordService.hash(input.newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { success: true };
  }

  async getMe(userId: string) {
    return authMeCacheFor(userId).getOrLoad(async () => {
      const user = await userRepository.findSessionById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }
      return mapUserToAuthResponse(user);
    });
  }

  private async issueTokensWithLoginUpdate(
    userId: string,
    email: string,
    role: { name: RoleName; permissions: unknown },
  ): Promise<AuthTokens> {
    const tokens = this.buildTokenPair(userId, email, role);
    const expiresAt = new Date(Date.now() + parseDurationToMs(jwtConfig.refreshExpiresIn));

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      }),
      prisma.refreshToken.create({
        data: {
          token: tokens.refreshToken,
          userId,
          expiresAt,
        },
      }),
    ]);

    return tokens;
  }

  private buildTokenPair(
    userId: string,
    email: string,
    role: { name: RoleName; permissions: unknown },
  ): AuthTokens {
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

    return { accessToken, refreshToken };
  }

  private async issueTokens(
    userId: string,
    email: string,
    role: { name: RoleName; permissions: unknown },
  ): Promise<AuthTokens> {
    const tokens = this.buildTokenPair(userId, email, role);
    const expiresAt = new Date(Date.now() + parseDurationToMs(jwtConfig.refreshExpiresIn));

    await prisma.refreshToken.create({
      data: {
        token: tokens.refreshToken,
        userId,
        expiresAt,
      },
    });

    return tokens;
  }
}

export const authService = new AuthService();
