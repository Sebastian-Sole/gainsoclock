// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Files allowed to use a raw `TextInput` from react-native. Everything else
// must go through the Input primitive (@/components/ui/input) — hand-rolled
// single-line TextInputs render their text/placeholder off-centre on iOS and
// this has regressed 10+ times (rule: .claude/rules/coding-conventions.md,
// "Single-line text inputs").
//
// Legitimate reasons to be on this list: the primitive itself, multiline
// fields (chat), borderless display-style inputs (SetInput/BigInput/MmSs/
// time), inputs needing a TextInput ref type, and files that predate the
// rule. Do NOT add a new file here for a plain single-line form field.
// Every file here has been audited against the single-line input rules
// (.claude/rules/coding-conventions.md → "Single-line text inputs"):
// min-h boxes (never fixed h), py-0 + text-[Npx] on the input. The
// `pnpm check:inputs` tripwire re-checks them on every /verify. Search
// rows use the Input primitive's leftIcon/rightIcon — they no longer
// justify an entry here.
const RAW_TEXT_INPUT_ALLOWLIST = [
  'components/ui/input.tsx',
  // multiline / display-style / composite inputs
  'components/chat/chat-input.tsx',
  'components/chat/plan-day-detail.tsx',
  'components/shared/numeric-input.tsx',
  'components/shared/time-input.tsx',
  'components/workout/focus/focus-set-card.tsx',
  'components/workout/interval-set-inputs.tsx',
  'components/workout/set-input.tsx',
  // ref-chained or styling the Input primitive can't express (audited 2026-07)
  'app/(auth)/sign-in.tsx',
  'app/(auth)/sign-up.tsx',
  'app/calculator/converter.tsx',
  'app/plan/\\[id\\].tsx', // brackets escaped: [id] would parse as a glob character class
  'app/recipe/create.tsx',
  'app/scan/index.tsx',
  'app/settings/delete-account.tsx',
  'app/settings/index.tsx',
  'components/auth/link-apple-sheet.tsx',
  'components/nutrition/edit-goals-modal.tsx',
  'components/nutrition/log-meal-modal.tsx',
  'components/nutrition/photo-meal-sheet.tsx',
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['TextInput'],
              message:
                'Single-line TextInputs render off-centre on iOS unless built exactly right (this has regressed 10+ times). Use the Input primitive from @/components/ui/input. If this file genuinely needs a raw TextInput (multiline, display-style), add it to RAW_TEXT_INPUT_ALLOWLIST in eslint.config.js with a reason.',
            },
          ],
        },
      ],
    },
  },
  {
    files: RAW_TEXT_INPUT_ALLOWLIST,
    rules: { 'no-restricted-imports': 'off' },
  },
]);
