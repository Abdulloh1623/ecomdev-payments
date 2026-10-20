import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    // Отдельная БД для тестов; файлы выполняются последовательно, т. к. база общая
    env: { DATABASE_URL: 'file:./test.db' },
    fileParallelism: false,
  },
});
