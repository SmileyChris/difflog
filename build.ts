#!/usr/bin/env bun
/**
 * Build script for Cloudflare Pages deployment
 * Bundles client-side TypeScript and copies static assets to dist/
 */

import { mkdir, rm, cp, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import pkg from './package.json';

const APP_VERSION = pkg.version;

const ROOT = import.meta.dir;
const DIST = join(ROOT, 'dist');
const PUBLIC = join(ROOT, 'public');
const SRC = join(ROOT, 'src');
const PARTIALS = join(ROOT, 'partials');

// Cache for partial contents
const partialsCache = new Map<string, string>();

async function processIncludes(html: string): Promise<string> {
  const includeRegex = /<!-- @include (\S+) -->/g;
  let result = html;
  let match;

  while ((match = includeRegex.exec(html)) !== null) {
    const [fullMatch, partialPath] = match;

    if (!partialsCache.has(partialPath)) {
      const fullPath = join(ROOT, partialPath);
      const content = await readFile(fullPath, 'utf-8');
      partialsCache.set(partialPath, content.trim());
    }

    result = result.replace(fullMatch, partialsCache.get(partialPath)!);
  }

  // Inject app version
  result = result.replace(/\{\{APP_VERSION\}\}/g, APP_VERSION);

  return result;
}

async function clean() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });
}

async function bundleClientJS() {
  const isDev = process.env.NODE_ENV !== 'production';
  const result = await Bun.build({
    entrypoints: [join(SRC, 'app.ts')],
    outdir: DIST,
    minify: !isDev,
    sourcemap: isDev ? 'inline' : 'external',
    target: 'browser',
  });

  if (!result.success) {
    console.error('Build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`✓ Bundled app.ts → dist/app.js ${isDev ? '(dev mode, not minified)' : '(minified)'}`);
}

async function copyPublicFiles() {
  async function processDir(srcDir: string, destDir: string) {
    await mkdir(destDir, { recursive: true });
    const entries = await readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = join(srcDir, entry.name);
      const destPath = join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively process subdirectories
        await processDir(srcPath, destPath);
      } else if (entry.name.endsWith('.html')) {
        // Process HTML files for includes
        const content = await readFile(srcPath, 'utf-8');
        const processed = await processIncludes(content);
        await writeFile(destPath, processed);
      } else if (entry.name.endsWith('.svg') || entry.name.endsWith('.png') || entry.name.endsWith('.ico') || entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.startsWith('_')) {
        // Copy other static assets and Cloudflare Pages config files (_redirects, _headers)
        await cp(srcPath, destPath);
      }
    }
  }

  await processDir(PUBLIC, DIST);
  console.log('✓ Processed HTML files and assets → dist/');
}

async function bundleStyles() {
  const isDev = process.env.NODE_ENV !== 'production';
  const result = await Bun.build({
    entrypoints: [join(SRC, 'styles.css')],
    outdir: DIST,
    minify: !isDev,
    naming: 'styles.css',
  });

  if (!result.success) {
    console.error('CSS build failed:');
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  console.log(`✓ Bundled styles.css → dist/ ${isDev ? '(dev mode, not minified)' : '(minified)'}`);
}

async function copyPartials() {
  const partialsDir = join(ROOT, 'partials');
  const destDir = join(DIST, 'partials');
  try {
    await mkdir(destDir, { recursive: true });
    await cp(partialsDir, destDir, { recursive: true });
    console.log('✓ Copied partials/ → dist/partials/');
  } catch {
    console.log('✓ No partials to copy');
  }
}

async function copyFunctions() {
  const functionsDir = join(ROOT, 'functions');
  const destDir = join(DIST, 'functions');
  try {
    await cp(functionsDir, destDir, { recursive: true });
    console.log('✓ Copied functions/ → dist/functions/');
  } catch {
    console.log('✓ No functions to copy');
  }
}

async function build() {
  console.log('Building for Cloudflare Pages...\n');

  await clean();
  await bundleClientJS();
  await copyPublicFiles();
  await bundleStyles();
  await copyPartials();
  // Functions are handled by wrangler directly, no need to copy

  console.log('\n✓ Build complete! Output in dist/');
  console.log('\nTo deploy:');
  console.log('  1. Create D1 database: bun run db:create');
  console.log('  2. Update wrangler.toml with database_id');
  console.log('  3. Run migration: bun run db:migrate');
  console.log('  4. Deploy: bun run deploy');
}

build().catch(console.error);
