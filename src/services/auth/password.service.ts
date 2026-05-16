import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async compare(plainPassword: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, hash);
  }
}

export const passwordService = new PasswordService();
