import { existsSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();

/**
 * Load env files in order (.env → .env.local overrides).
 * Prisma CLI reads `.env` from project root; keep DATABASE_URL / DIRECT_URL there
 * or use npm scripts with dotenv-cli for `.env.local`.
 */
const envFiles = ['.env', '.env.local'];

for (const file of envFiles) {
  const filePath = path.join(root, file);
  if (existsSync(filePath)) {
    dotenv.config({
      path: filePath,
      override: file !== '.env',
    });
  }
}
