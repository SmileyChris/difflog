#!/usr/bin/env bun
/**
 * Development server script
 * - Builds the project
 * - Runs migrations
 * - Starts stripe listen for webhook forwarding
 * - Starts wrangler pages dev with the webhook secret
 */

import { spawn, spawnSync } from 'bun';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const WRANGLER_PORT = 8788;

// Check if stripe CLI is available (local ./stripe or in PATH)
const localStripe = join(import.meta.dir, 'stripe');
const hasLocalStripe = existsSync(localStripe);
const stripeCheck = spawnSync(['which', 'stripe']);
const hasStripe = hasLocalStripe || stripeCheck.exitCode === 0;
const stripeBin = hasLocalStripe ? localStripe : 'stripe';

// Build first
console.log('📦 Building...');
const build = spawnSync(['bun', 'run', 'build'], { stdout: 'inherit', stderr: 'inherit' });
if (build.exitCode !== 0) {
  console.error('Build failed');
  process.exit(1);
}

// Run migrations
console.log('🗄️  Running migrations...');
const migrate = spawnSync(['bun', 'run', 'dev:migrate'], { stdout: 'inherit', stderr: 'inherit' });
if (migrate.exitCode !== 0) {
  console.error('Migration failed');
  process.exit(1);
}

// Get webhook secret from stripe (if available)
let webhookSecret: string | undefined;
let stripeProc: ReturnType<typeof spawn> | null = null;

if (hasStripe) {
  console.log('🔗 Getting Stripe webhook secret...');
  const secretResult = spawnSync([stripeBin, 'listen', '--print-secret']);
  if (secretResult.exitCode === 0) {
    webhookSecret = secretResult.stdout.toString().trim();
    console.log(`✓ Webhook secret: ${webhookSecret.slice(0, 12)}...`);

    // Start stripe listen in background
    console.log('🔗 Starting Stripe webhook forwarding...');
    stripeProc = spawn([stripeBin, 'listen', '--forward-to', `localhost:${WRANGLER_PORT}/api/purchase/webhook`], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    // Log stripe output
    (async () => {
      const reader = stripeProc!.stdout.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        if (text.includes('Ready!')) {
          console.log('✓ Stripe webhook forwarding ready');
        } else if (text.includes('-->')) {
          // Log webhook events
          console.log(`🔔 ${text.trim()}`);
        }
      }
    })();
  } else {
    console.log('⚠️  Could not get Stripe webhook secret (not logged in?)');
    console.log('   Run: stripe login');
  }
} else {
  console.log('⚠️  Stripe CLI not found, webhook forwarding disabled');
  console.log('   Install: https://stripe.com/docs/stripe-cli');
}

// Start watcher
console.log('👀 Starting file watcher...');
const watcher = spawn(['bun', 'run', 'watch.ts'], {
  stdout: 'inherit',
  stderr: 'inherit',
});

// Build wrangler command
const wranglerArgs = ['pages', 'dev', 'dist', '--persist-to=.wrangler/state', '--live-reload'];
if (webhookSecret) {
  wranglerArgs.push('--binding', `STRIPE_WEBHOOK_SECRET=${webhookSecret}`);
}

// Start wrangler
console.log(`🚀 Starting wrangler on port ${WRANGLER_PORT}...`);
const wrangler = spawn(['wrangler', ...wranglerArgs], {
  stdout: 'inherit',
  stderr: 'inherit',
});

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  watcher.kill();
  wrangler.kill();
  if (stripeProc) stripeProc.kill();
  process.exit(0);
});

// Wait for wrangler to exit
await wrangler.exited;
watcher.kill();
if (stripeProc) stripeProc.kill();
