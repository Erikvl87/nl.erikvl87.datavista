// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['widgets/*/public/*.js', 'widgets/**/*.js', 'website/**', 'node_modules/**', '.homeybuild/**', 'build.mjs', 'eslint.config.mjs'],
	},
	{
		files: ['**/*.js', '**/*.ts'],
		extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
				sourceType: 'module',
			},
		},
		rules: {
			'no-unused-vars': 'off', // Disable the base rule as it can report incorrect errors
			'@typescript-eslint/no-unused-vars': [
				// Error on unused variables
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'@typescript-eslint/explicit-function-return-type': 'error', // Enforce explicit return type
			'@typescript-eslint/no-floating-promises': 'error', // Enforce awaiting async functions,
			'@typescript-eslint/no-explicit-any': 'warn', // Warn on explicit any
			indent: ['error', 'tab', { SwitchCase: 1 }],
			'@typescript-eslint/naming-convention': 'error', // Enforce naming conventions
		},
	},
	{
		files: ['constants.mts'],
		plugins: { '@typescript-eslint': tseslint.plugin },
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: './tsconfig.json',
				sourceType: 'module',
			},
		},
		rules: {
			'@typescript-eslint/naming-convention': [
				'error',
				{
					selector: 'enum',
					format: ['UPPER_CASE'],
				},
				{
					selector: 'enumMember',
					format: ['UPPER_CASE'],
				},
				{
					selector: 'variable',
					modifiers: ['const'],
					format: ['UPPER_CASE'],
					filter: {
						regex: '^DATAVISTA_',
						match: true,
					},
				},
			],
		},
	},
);
