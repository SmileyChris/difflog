#!/usr/bin/env bun
/**
 * Build script for Cloudflare Pages deployment
 * Bundles client-side TypeScript and copies static assets to dist/
 */

import { mkdir, rm, cp, readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

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
  const files = await readdir(PUBLIC);
  for (const file of files) {
    if (file.endsWith('.html')) {
      // Process HTML files for includes
      const content = await readFile(join(PUBLIC, file), 'utf-8');
      const processed = await processIncludes(content);
      await writeFile(join(DIST, file), processed);
    } else if (file.endsWith('.svg') || file.endsWith('.png') || file.endsWith('.ico')) {
      // Copy other static assets directly
      await cp(join(PUBLIC, file), join(DIST, file));
    }
  }
  console.log('✓ Processed HTML files and assets → dist/');
}

async function copyStyles() {
  await cp(join(SRC, 'styles.css'), join(DIST, 'styles.css'));
  console.log('✓ Copied styles.css → dist/');
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
  await copyStyles();
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
