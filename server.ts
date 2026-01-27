/**
 * Simple development server for static file serving
 * Use `bun run dev:static` for quick UI iteration (no D1)
 * Use `bun run dev` for full Cloudflare Pages simulation with D1
 */

import { resolve, join } from 'path';

const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, 'public');
const SRC = join(ROOT, 'src');

// Build client JS on startup
console.log('Building client JS...');
const buildResult = await Bun.build({
  entrypoints: [join(SRC, 'app.ts')],
  outdir: PUBLIC,
  minify: false,
  sourcemap: 'inline',
  target: 'browser',
});

if (!buildResult.success) {
  console.error('Build failed:', buildResult.logs);
  process.exit(1);
}
console.log('✓ Built app.js');

// Copy styles
await Bun.write(join(PUBLIC, 'styles.css'), Bun.file(join(SRC, 'styles.css')));
console.log('✓ Copied styles.css');

const ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/welcome': 'welcome.html',
  '/setup': 'setup.html',
  '/profiles': 'profiles.html',
  '/archive': 'archive.html',
  '/stars': 'stars.html',
  '/share': 'share.html',
};

Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Static files
    if (pathname.startsWith('/app.js') || pathname.startsWith('/styles.css')) {
      const file = Bun.file(join(PUBLIC, pathname.slice(1)));
      if (await file.exists()) {
        return new Response(file, {
          headers: { 'Content-Type': pathname.endsWith('.js') ? 'application/javascript' : 'text/css' }
        });
      }
    }

    // Partials
    if (pathname.startsWith('/partials/')) {
      const file = Bun.file(join(ROOT, pathname.slice(1)));
      if (await file.exists()) {
        return new Response(file, { headers: { 'Content-Type': 'text/html' } });
      }
    }

    // API routes - return mock responses for static dev
    if (pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({
        error: 'API not available in static dev mode. Use `bun run dev` for full CF Pages simulation.'
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // HTML pages
    const htmlFile = ROUTES[pathname];
    if (htmlFile) {
      const file = Bun.file(join(PUBLIC, htmlFile));
      if (await file.exists()) {
        return new Response(file, { headers: { 'Content-Type': 'text/html' } });
      }
    }

    // Share page with ID
    if (pathname.startsWith('/share/')) {
      const file = Bun.file(join(PUBLIC, 'share.html'));
      if (await file.exists()) {
        return new Response(file, { headers: { 'Content-Type': 'text/html' } });
      }
    }

    return new Response('Not found', { status: 404 });
  },
  development: true
});

console.log('\n🚀 Static dev server running at http://localhost:3000');
console.log('   Note: API endpoints require `bun run dev` (wrangler with D1)\n');
