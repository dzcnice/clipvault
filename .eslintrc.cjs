// ESLint 配置
// 覆盖 TypeScript + React 的基础规范；Tests 场景放宽
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true }
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  settings: {
    react: { version: '18' }
  },
  rules: {
    // 关闭原生 no-unused-vars，用 TS 版；忽略 `_` 前缀
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }
    ],
    // B-1：logger 改造完成后禁用 console，只允许通过 logger 上报
    'no-console': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
    // React 18 JSX transform 不需要 import React
    'react/react-in-jsx-scope': 'off',
    // JSX 属性转义规则偶尔误报，直接关闭
    'react/no-unescaped-entities': 'off'
  },
  overrides: [
    {
      // 测试文件允许使用 any 和 console
      files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off'
      }
    }
  ],
  ignorePatterns: [
    'dist',
    'dist-cli',
    'dist-types',
    'dist-types-web',
    'out',
    'node_modules',
    'resources',
    'coverage',
    '*.config.js',
    '*.config.cjs',
    '*.config.ts',
    '.eslintrc.cjs',
    'scripts',
    // Sprint 15：Playwright E2E 骨架（未装 @playwright/test 前用 @ts-nocheck 屏蔽）
    'e2e'
  ]
}
