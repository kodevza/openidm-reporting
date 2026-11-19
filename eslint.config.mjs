import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['assets/', 'coverage/']),
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
  },
  {
    files: ['src/*.ts', 'src/reportingApi/**/*.ts'],
    languageOptions: { sourceType: 'script' },
    rules: {
      // These OpenIDM and AMD scripts are built with module: none.
      'no-var': 'off',
      'prefer-rest-params': 'off',
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^(ReportingApi|ReportingConfig|request|context|openidm)$',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['src/reportingApi/render.ts', 'src/ui/history/export.ts'],
    rules: {
      // CSV export checks for control characters explicitly.
      'no-control-regex': 'off',
    },
  },
  {
    files: ['tests/ui.test.cjs'],
    languageOptions: { globals: { document: 'readonly', window: 'readonly' } },
  },
);
