import Alpine from 'alpinejs';
import persist from '@alpinejs/persist';

// Initialize plugins BEFORE importing store/components
Alpine.plugin(persist);

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
