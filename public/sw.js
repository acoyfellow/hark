self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('push', (event) => {
  const note = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return { body: event.data ? event.data.text() : '' };
    }
  })();
  event.waitUntil(self.registration.showNotification(note.title || 'hark', { body: note.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { href: note.href || '/' }, tag: note.tag || undefined }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((each) => new URL(each.url).origin === self.location.origin);
      if (open) return open.navigate(href).then((each) => (each || open).focus());
      return self.clients.openWindow(href);
    }),
  );
});
