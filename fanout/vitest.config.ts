import { defineConfig } from 'vitest/config';

const workspaceSourceGlobs = ['packages/**/*.test.ts', 'apps/api/**/*.test.ts', 'apps/worker/**/*.test.ts', 'apps/web/src/**/*.test.{ts,tsx}'];
const integrationTestGlob = '**/*.integration.test.ts';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: workspaceSourceGlobs,
          exclude: ['**/node_modules/**', integrationTestGlob],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: [`packages/${integrationTestGlob}`, `apps/${integrationTestGlob}`],
          exclude: ['**/node_modules/**'],
          environment: 'node',
          testTimeout: 180_000,
          hookTimeout: 240_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
