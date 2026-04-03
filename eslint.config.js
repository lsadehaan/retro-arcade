import globals from 'globals';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'warn',
      'no-unused-vars': 'error',
      'semi': ['error', 'always'],
    },
  },
];
