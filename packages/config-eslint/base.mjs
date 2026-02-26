import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export function defineBaseConfig(options = {}) {
  const { tsconfigRootDir = process.cwd() } = options;

  return tseslint.config(
    {
      ignores: [
        'dist/**',
        'build/**',
        'coverage/**',
        'node_modules/**',
        '.turbo/**',
        'eslint.config.*',
        '**/*.config.{js,cjs,mjs,ts}',
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        parserOptions: {
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          {
            prefer: 'type-imports',
            fixStyle: 'inline-type-imports',
          },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
  );
}
