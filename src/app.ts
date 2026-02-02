import Alpine from 'alpinejs';
import persist from '@alpinejs/persist';
import { registerDirectives } from './directives';

// Initialize plugins and directives BEFORE importing store/components
Alpine.plugin(persist);
registerDirectives(Alpine);

// Dynamic imports ensure plugins are registered first
async function init() {
  // Import store (registers itself with Alpine.store())
  await import('./store');

  // Import components (each registers itself with Alpine.data())
  await import('./components');

  // Start Alpine
  Alpine.start();
}

init();
