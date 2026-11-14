import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.strict,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Hard rule: no inline styles in JSX.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="style"]',
          message: 'No inline styles: put styling in the component CSS file using tokens.css variables.',
        },
      ],
      // The activity scroll region must be keyboard-scrollable.
      'jsx-a11y/no-noninteractive-tabindex': ['error', { roles: ['region'] }],
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.audioWorklet },
    },
  },
])
