import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import unusedImports from 'eslint-plugin-unused-imports'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores([
    'dist',
    'src/components/community/ModerationDialog.tsx',
    'src/components/community/TypingIndicator.tsx',
    'src/components/mvpblocks/globe1.tsx',
    'src/components/ui/globe.tsx',
    'src/components/ui/multi-step-form.tsx',
    'src/components/ui/use-toast.tsx',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      'prefer-const': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'unused-imports': unusedImports,
    },
  },
])
