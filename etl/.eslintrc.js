module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'sql'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    'sql/format': [
      'error',
      {
        ignoreInline: true,
        ignoreTagless: true,
        ignoreStartWithNewLine: false,
      },
      {
        language: 'sqlite',
        tabWidth: 2,
      },
    ],
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js'],
  overrides: [
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
    {
      files: ['**/*.ts'],
      excludedFiles: ['src/repositories/**/*.ts'],
      rules: {
        'sql/format': 'off',
      },
    },
  ],
};
