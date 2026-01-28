// Service worker for difflog reminders
// Handles notification display and click-to-open

// Take over immediately when updated
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing window if found
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none found
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_REMINDER') {
    const delay = event.data.delay || 0;
    const showNotif = () => {
      self.registration.showNotification('diff·log', {
        body: event.data.body || "Time to check what's new in your dev ecosystem!",
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: 'difflog-reminder',
        requireInteraction: false
      });
    };

    if (delay > 0) {
      setTimeout(showNotif, delay);
    } else {
      showNotif();
    }
  }
});
