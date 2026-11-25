self.addEventListener('push', event => {
  let orderId;
  try { orderId = event.data?.json().orderId; } catch { return; }
  if (typeof orderId !== 'string' || !orderId) return;
  event.waitUntil(self.registration.showNotification('Nuevo pedido en CleanSur', {
    body: 'Tocá para abrir el pedido en el ERP.',
    tag: 'cleansur-order-' + orderId,
    data: { orderId },
    icon: new URL('assets/cleansur-isotipo.svg', self.registration.scope).href
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL('index.html', self.registration.scope);
  url.searchParams.set('central', '1');
  url.searchParams.set('pedido', event.notification.data.orderId);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).pathname === url.pathname ||
      new URL(client.url).href.startsWith(self.registration.scope) && client.url.split('?')[0] === self.registration.scope);
    if (existing) {
      const navigated = await existing.navigate(url.href).catch(() => null);
      if (navigated) return navigated.focus();
    }
    return self.clients.openWindow(url.href);
  })());
});
