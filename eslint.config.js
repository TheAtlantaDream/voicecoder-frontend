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
    // The teammate's bridge page predates the CLAUDE.md rules. Keep its issues
    // visible as warnings instead of failing lint; see BRIDGE_INTEGRATION.md.
    files: ['src/bridge/**/*.{ts,tsx}', 'src/components/{Workspace,BridgeStatus,EventLog,TalkControls,TextPrompt}.tsx'],
    rules: {
      'no-restricted-syntax': 'warn',
      'jsx-a11y/role-supports-aria-props': 'warn',
    },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: {
      globals: { ...globals.audioWorklet },
    },
  },
])
