module.exports = {
  root: true,

  env: {
    node: true,
    jest: true,
  },

  parser: '@typescript-eslint/parser',

  extends: [
    'standard-with-typescript',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    // TODO: make this work with typescript
    // 'plugin:node/recommended'
    'prettier',
  ],

  plugins: ['@typescript-eslint', 'node', 'security'],

  parserOptions: {
    tsconfigRootDir: __dirname,
    project: './tsconfig.json',
  },

  globals: {
    __statics: true,
    process: true,
  },

  // add your custom rules here
  rules: {
    // allow console.log during development only
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    // allow debugger during development only
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-process-exit': 'off',
    'space-before-function-paren': 'off',
    '@typescript-eslint/default-param-last': 'off',
    '@typescript-eslint/strict-boolean-expressions': 0,
    '@typescript-eslint/triple-slash-reference': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/prefer-ts-expect-error': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/return-await': 'off',
    'no-return-await': 'warn',
  },
};
