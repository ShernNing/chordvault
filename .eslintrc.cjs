module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    // App is plain JS/JSX without prop-types — don't demand them.
    'react/prop-types': 'off',
    // Allow intentionally-unused bindings when prefixed with _ (e.g. positional args).
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
    // Empty catch blocks are intentional (localStorage / JSON.parse guards).
    'no-empty': ['error', { allowEmptyCatch: true }],
    // Curly quotes/apostrophes in copy are fine; this rule is pure cosmetics.
    'react/no-unescaped-entities': 'off',
  },
}
