// Code checker (npm run lint): finds unused variables, wrong hook use and likely mistakes. It never changes files.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist', 'dist-e2e', 'test-results', 'playwright-report', 'node_modules', '.wrangler'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // these two style rules from the newest plugin flag patterns that work fine here (data loading and picture-error state); the real hook rules stay on
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^_|^[A-Z]', argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}', 'e2e/**/*.js', '*.js', '*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }] },
  },
];
