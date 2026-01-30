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

// Generate deterministic 6-digit code from email (for dev testing)
const DEV_SECRET = 'difflog-dev-secret';
async function generateCode(email: string): Promise<string> {
  const data = new TextEncoder().encode(email + DEV_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(hash);
  // Use first 4 bytes to create a number, then take last 6 digits
  const num = (arr[0] << 24 | arr[1] << 16 | arr[2] << 8 | arr[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

const ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/about': 'about/index.html',
  '/about/privacy': 'about/privacy.html',
  '/about/terms': 'about/terms.html',
  '/setup': 'setup.html',
  '/profiles': 'profiles.html',
  '/archive': 'archive.html',
  '/stars': 'stars.html',
  '/share': 'share.html',
  '/creds': 'creds.html',
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

    // API routes - mock creds endpoints for dev, others return 503
    if (pathname === '/api/creds/request' && req.method === 'POST') {
      const body = await req.json() as { email: string };
      const code = await generateCode(body.email);
      console.log(`\n📧 [Mock Email] Verification code for ${body.email}: ${code}\n`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (pathname === '/api/creds/verify' && req.method === 'POST') {
      const body = await req.json() as { email: string; code: string };
      const expectedCode = await generateCode(body.email);
      if (body.code === expectedCode) {
        console.log(`\n✅ [Mock Email] Verified ${body.email} - User created with 5 creds\n`);
        return new Response(JSON.stringify({ success: true, creds: 5 }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

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
