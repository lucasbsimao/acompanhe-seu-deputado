module.exports = {
  preset: 'react-native',
  testMatch: [
    '**/__tests__/**/*.test.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': 'babel-jest',
  },
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/'],
  roots: ['<rootDir>/app/src', '<rootDir>/__tests__', '<rootDir>/app/test'],
  collectCoverageFrom: [
    'app/src/**/*.{ts,tsx}',
    '!app/src/**/*.d.ts',
  ],
};
