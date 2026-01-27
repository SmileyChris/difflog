#!/usr/bin/env bun
/**
 * File watcher that rebuilds on changes
 */

import { watch } from 'fs';
import { join } from 'path';
import { spawn } from 'bun';

const ROOT = import.meta.dir;
const SRC = join(ROOT, 'src');
const PUBLIC = join(ROOT, 'public');
const FUNCTIONS = join(ROOT, 'functions');
const PARTIALS = join(ROOT, 'partials');

let buildTimeout: Timer | null = null;
let isBuilding = false;

async function build() {
  if (isBuilding) return;
  isBuilding = true;

  console.log('\n🔄 Rebuilding...');
  const start = Date.now();

  const proc = spawn(['bun', 'run', 'build'], {
    cwd: ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  await proc.exited;
  console.log(`✓ Built in ${Date.now() - start}ms\n`);
  isBuilding = false;
}

function debounceRebuild() {
  if (buildTimeout) clearTimeout(buildTimeout);
  buildTimeout = setTimeout(build, 100);
}

console.log('👀 Watching for changes...');

for (const dir of [SRC, PUBLIC, FUNCTIONS, PARTIALS]) {
  try {
    watch(dir, { recursive: true }, (event, filename) => {
      if (filename && !filename.includes('node_modules')) {
        console.log(`📝 ${filename} changed`);
        debounceRebuild();
      }
    });
  } catch (e) {
    // Directory might not exist
  }
}

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Stopping watcher');
  process.exit(0);
});

// Prevent exit
await new Promise(() => {});
