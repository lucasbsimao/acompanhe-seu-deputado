// Flat config (ESLint 9). Used by `check.py` only — never picked up by project
// configs because `check.py` invokes ESLint with `--no-config-lookup -c`.
//
// Rule thresholds intentionally match the plan-execution skill's documented
// gate. If you change them here, update the skill's "Cognitive complexity"
// bullet so the agent's expectation stays in sync with reality.

const tsParser = require('@typescript-eslint/parser');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = [
  {
    files: ['**/*.{ts,tsx,cts,mts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 2022,
      },
    },
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
      complexity: ['error', { max: 15 }],
      'max-lines-per-function': [
        'error',
        { max: 100, skipBlankLines: true, skipComments: true, IIFEs: true },
      ],
      'max-depth': ['error', 4],
    },
  },
];
