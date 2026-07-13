module.exports = {
  env: { browser: true, es2022: true, node: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  ignorePatterns: ['dist/**', 'node_modules/**'],
  rules: {
    'no-undef': 'error',
    'no-unreachable': 'error',
  },
}
