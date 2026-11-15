// Clave publicable (NO service_role). Las reglas de acceso se aplican en Supabase.
export const STAYCLEAN_SUPABASE_URL = 'https://zesdbnbijoqjjmwhuttp.supabase.co';
export const STAYCLEAN_PUBLISHABLE_KEY = 'sb_publishable_2KBHXft_-XN5uXakphSaTw_0ANg9Oy3';

async function rpc(name, payload = {}) {
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo comunicar con Supabase');
  return data;
}

export const staycleanPublicCatalog = () => rpc('stayclean_public_catalog');
export const staycleanCreateOrder = order => rpc('create_web_order_with_stock_deduction', { p_order: order });
