import { getAdminSession, refreshAdminSession } from './supabase_admin.js';
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from './supabase_public.js';

export async function orderAlertRequest(path, body) {
  await refreshAdminSession();
  const token = getAdminSession()?.access_token;
  if (!token) throw new Error('Volvé a ingresar al ERP.');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error('No se pudo completar la operación.');
  const payload = await response.text();
  return payload ? JSON.parse(payload) : null;
}

export async function markOrderReviewed(orderNumber) {
  const params = new URLSearchParams({ order_number: 'eq.' + orderNumber, select: 'id,source', limit: '1' });
  const [order] = await orderAlertRequest('orders?' + params);
  if (order?.source !== 'TIENDA_ONLINE') return;
  await orderAlertRequest('rpc/cleansur_review_order', { p_order_id: order.id });
  window.dispatchEvent(new Event('cleansur-order-reviewed'));
}

const supported = () => isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const endpointParams = subscription => ({ p_endpoint: subscription?.endpoint ?? null });

export async function stopOrderPush() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.getRegistration(new URL('../index.html', import.meta.url));
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    await orderAlertRequest('rpc/cleansur_push_device', endpointParams(subscription));
  } finally {
    await subscription.unsubscribe();
  }
}

export async function setupOrderPush(showMessage) {
  const button = document.getElementById('order-push-settings');
  const worker = new URL('../order-push-worker.js', import.meta.url);
  try {
    const registration = supported() ? await navigator.serviceWorker.register(worker) : null;
    let subscription = await registration?.pushManager.getSubscription();
    const settings = await orderAlertRequest('rpc/cleansur_push_settings', endpointParams(subscription));
    if (!settings.allowed) return;
    button.hidden = false;
    const update = active => {
      button.textContent = active ? 'Desactivar push' : 'Activar push';
      button.setAttribute('aria-pressed', String(active));
    };
    update(settings.active === true);
    button.onclick = async () => {
      if (!registration) {
        showMessage('En iPhone o iPad, agregá CleanSur a la pantalla de inicio y abrilo desde allí. En otros equipos usá un navegador compatible.', 'error');
        return;
      }
      button.disabled = true;
      try {
        if (button.getAttribute('aria-pressed') === 'true') {
          await stopOrderPush();
          subscription = null;
          update(false);
          return;
        }
        if (await Notification.requestPermission() !== 'granted') {
          throw new Error('Habilitá las notificaciones de CleanSur en la configuración del navegador o del dispositivo.');
        }
        const latest = await orderAlertRequest('rpc/cleansur_push_settings', endpointParams(subscription));
        if (!latest.publicKey) throw new Error('Las notificaciones están inicializándose. Volvé a intentar.');
        const ready = await navigator.serviceWorker.ready;
        subscription ||= await ready.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: latest.publicKey });
        const { keys } = subscription.toJSON();
        await orderAlertRequest('rpc/cleansur_push_device', {
          p_endpoint: subscription.endpoint, p_key: keys.p256dh, p_auth: keys.auth
        });
        update(true);
        showMessage('Notificaciones activadas en este dispositivo.');
      } catch (error) {
        showMessage(error.message, 'error');
      } finally {
        button.disabled = false;
      }
    };
  } catch {
    button.hidden = false;
    button.textContent = 'Push no disponible';
    button.disabled = true;
  }
}
