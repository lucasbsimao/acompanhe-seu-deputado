import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import reactNativeEslintPlugin from '@react-native/eslint-plugin';
import jestPlugin from 'eslint-plugin-jest';
import eslintComments from 'eslint-plugin-eslint-comments';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'android/**',
      'ios/**',
      'dist/**',
      '*.config.js',
      '.claude/**',
      '__tests__/**',
      'etl/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-native': reactNativePlugin,
      '@react-native': reactNativeEslintPlugin,
      'eslint-comments': eslintComments,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-react': 'warn',
      'react/jsx-uses-vars': 'warn',
      'react/no-did-mount-set-state': 'warn',
      'react/no-did-update-set-state': 'warn',
      'react/no-string-refs': 'error',
      'react/no-unstable-nested-components': 'warn',
      'react/react-in-jsx-scope': 'off',
      'react/self-closing-comp': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-native/no-inline-styles': 'warn',
      'eslint-comments/no-aggregating-enable': 'warn',
      'eslint-comments/no-unlimited-disable': 'warn',
      'eslint-comments/no-unused-disable': 'warn',
      'eslint-comments/no-unused-enable': 'warn',
    },
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.{ts,tsx}'],
  })),
  {
    files: ['**/*.{spec,test}.{js,ts,tsx}', '**/__tests__/**/*.{js,ts,tsx}'],
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-disabled-tests': 'warn',
      'jest/no-focused-tests': 'warn',
      'jest/no-identical-title': 'warn',
      'jest/valid-expect': 'warn',
    },
  },
  prettierConfig,
);
