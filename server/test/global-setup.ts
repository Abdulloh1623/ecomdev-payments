import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Тестовая БД — отдельный файл server/prisma/test.db; пересоздаём его по миграциям
export default function setup() {
  const dbFile = fileURLToPath(new URL('../prisma/test.db', import.meta.url));
  rmSync(dbFile, { force: true });
  rmSync(`${dbFile}-journal`, { force: true });
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
    stdio: 'pipe',
  });
}
