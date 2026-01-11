/* eslint-disable no-console, no-undef */
import * as esbuild from 'esbuild';
import { rename, unlink, rmdir, readdir } from 'fs/promises';
import { glob } from 'glob';
import { join } from 'path';

// Bundle only main entry points (not widget APIs to avoid code duplication)
const results = await Promise.all([
	// Main app entry - bundle everything
	esbuild.build({
		entryPoints: ['.homeybuild/app.mjs'],
		bundle: true,
		platform: 'node',
		format: 'esm',
		outfile: '.homeybuild/app.bundle.mjs',
		external: ['homey', 'homey-api', 'homey-log'],
		treeShaking: true,
		minify: false,
		sourcemap: false,
		metafile: true,
	}),
	// Main API entry - bundle with dependencies
	esbuild.build({
		entryPoints: ['.homeybuild/api.mjs'],
		bundle: true,
		platform: 'node',
		format: 'esm',
		outfile: '.homeybuild/api.bundle.mjs',
		external: ['homey', 'homey-api', 'homey-log'],
		treeShaking: true,
		minify: false,
		sourcemap: false,
		metafile: true,
	}),
]);

// Replace originals with bundled versions
await unlink('.homeybuild/app.mjs');
await rename('.homeybuild/app.bundle.mjs', '.homeybuild/app.mjs');
await unlink('.homeybuild/api.mjs');
await rename('.homeybuild/api.bundle.mjs', '.homeybuild/api.mjs');

// Auto-cleanup: Collect all bundled files from all metafiles
const bundledFiles = new Set();
for (const result of results) {
	Object.keys(result.metafile.inputs).forEach(file => bundledFiles.add(file));
}

// Find files that widget APIs depend on (so we don't delete them)
const widgetApis = await glob('.homeybuild/widgets/*/api.mjs');
const widgetDependencies = new Set();
for (const widgetApi of widgetApis) {
	// Analyze what this widget would bundle to find its dependencies
	const analysis = await esbuild.build({
		entryPoints: [widgetApi],
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false, // Don't write the bundle, just analyze
		external: ['homey', 'homey-api', 'homey-log'],
		metafile: true,
	});
	// Add all its dependencies to the set
	Object.keys(analysis.metafile.inputs).forEach(file => {
		if (file.startsWith('.homeybuild/') && !file.includes('node_modules')) {
			widgetDependencies.add(file);
		}
	});
}

let cleaned = 0;
for (const file of bundledFiles) {
	if (file.startsWith('.homeybuild/') && 
		!file.includes('node_modules') && 
		!file.endsWith('/api.mjs') &&
		file !== '.homeybuild/app.mjs' &&
		// Don't delete files that widget APIs depend on
		!widgetDependencies.has(file)) {
		try {
			await unlink(file);
			// Also delete .map files
			try { await unlink(file + '.map'); } catch { /* ignore if .map doesn't exist */ }
			cleaned++;
		} catch (err) {
			// File might not exist or already deleted
		}
	}
}

// Remove empty directories
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function removeEmptyDirs(directory) {
	const entries = await readdir(directory, { withFileTypes: true });
	await Promise.all(
		entries.map(async (entry) => {
			const fullPath = join(directory, entry.name);
			if (entry.isDirectory()) {
				await removeEmptyDirs(fullPath);
				// Check if directory is now empty and remove it
				const remaining = await readdir(fullPath);
				if (remaining.length === 0) {
					await rmdir(fullPath);
					cleaned++;
				}
			}
		})
	);
}

await removeEmptyDirs('.homeybuild');

console.log(`✅ Bundle complete - app.mjs and api.mjs bundled (widgets share code to reduce RAM)`);
console.log(`🧹 Auto-cleaned ${cleaned} items`);
