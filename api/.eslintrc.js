module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'security'],
  extends: ['plugin:@typescript-eslint/recommended', 'plugin:security/recommended-legacy'],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'dist', 'node_modules'],
  rules: {
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Security plugin flags Prisma's parameterized queries and other
    // non-issues as "detect-object-injection" false positives across this
    // codebase; kept as a warning rather than disabled outright so real
    // findings are still visible during review.
    'security/detect-object-injection': 'warn',
  },
};
