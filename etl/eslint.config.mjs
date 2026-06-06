import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import sqlPlugin from 'eslint-plugin-sql';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '*.js', '*.mjs'],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      sql: sqlPlugin,
    },
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
    },
  },
  prettierConfig,
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    files: ['src/repositories/**/*.ts'],
    rules: {
      'sql/format': [
        'error',
        {
          ignoreInline: true,
          ignoreTagless: false,
          ignoreStartWithNewLine: false,
        },
        {
          language: 'sqlite',
          tabWidth: 2,
        },
      ],
    },
  },
);
