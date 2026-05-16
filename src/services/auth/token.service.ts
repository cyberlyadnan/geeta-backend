import jwt from 'jsonwebtoken';
import { jwtConfig } from '../../config/jwt.js';
import { ApiError } from '../../common/errors/ApiError.js';
import type { JwtPayload } from '../../types/index.js';
import type { RoleName } from '@prisma/client';

interface TokenUser {
  id: string;
  email: string;
  role: RoleName;
  permissions?: string[];
}

class TokenService {
  generateAccessToken(user: TokenUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
      ...(user.permissions && { permissions: user.permissions }),
    };

    return jwt.sign(payload, jwtConfig.accessSecret, {
      expiresIn: jwtConfig.accessExpiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  generateRefreshToken(user: TokenUser): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'refresh',
    };

    return jwt.sign(payload, jwtConfig.refreshSecret, {
      expiresIn: jwtConfig.refreshExpiresIn as jwt.SignOptions['expiresIn'],
    });
  }

  verifyAccessToken(token: string): JwtPayload & { permissions?: string[] } {
    try {
      const payload = jwt.verify(token, jwtConfig.accessSecret) as JwtPayload & {
        permissions?: string[];
      };
      if (payload.type !== 'access') {
        throw ApiError.unauthorized('Invalid token type');
      }
      return payload;
    } catch {
      throw ApiError.unauthorized('Invalid or expired access token');
    }
  }

  verifyRefreshToken(token: string): JwtPayload {
    try {
      const payload = jwt.verify(token, jwtConfig.refreshSecret) as JwtPayload;
      if (payload.type !== 'refresh') {
        throw ApiError.unauthorized('Invalid token type');
      }
      return payload;
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }
  }
}

export const tokenService = new TokenService();
