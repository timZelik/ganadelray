import javascript from '@eslint/js';
import typescript from 'typescript-eslint';

export default typescript.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/drizzle/**', '**/playwright-report/**', '**/test-results/**', '**/routeTree.gen.ts'] },
  javascript.configs.recommended,
  ...typescript.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'id-length': ['error', { min: 2, exceptions: ['_', 'x', 'y'], properties: 'never' }],
    },
  },
);
