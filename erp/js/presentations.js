import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from './supabase_public.js';
import { getAdminSession } from './supabase_admin.js';

async function presentationRequest(name, args, token = STAYCLEAN_PUBLISHABLE_KEY) {
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'No se pudieron consultar las presentaciones');
  return data;
}

export function publicPresentations() {
  return presentationRequest('stayclean_store_presentations', {});
}

export function staffPresentations(productId = null) {
  const token = getAdminSession()?.access_token;
  if (!token) throw new Error('Iniciá sesión para consultar presentaciones');
  return presentationRequest('stayclean_staff_product_presentations', { p_product: productId }, token);
}

export function escapePresentation(value) {
  return String(value ?? '').replace(/[&<>"']/g, char =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
}

export function presentationOptions(forms, productId, selected = '') {
  const available = forms.filter(form => form.product_id === productId && (form.active || form.id === selected));
  return '<option value="">Unidad habitual</option>' + available.map(form =>
    '<option value="' + escapePresentation(form.id) + '"' + (form.id === selected ? ' selected' : '') + '>' +
    escapePresentation(form.name + ' · ' + form.code + ' · ×' + form.factor) + '</option>'
  ).join('');
}
