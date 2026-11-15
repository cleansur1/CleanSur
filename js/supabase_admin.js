// Panel administrativo StayClean: acceso con Supabase Auth y RLS, solo lectura.
// No almacenar tokens en localStorage; las sesiones viven en memoria.
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from './supabase_public.js';

let session = null;
const headers = (token) => ({
  apikey: STAYCLEAN_PUBLISHABLE_KEY,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});
async function parse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.msg || 'Error de acceso');
  return payload;
}
export function getAdminSession() { return session; }
export async function signInAdmin(email, password) {
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const candidate = await parse(response);
  const staffResponse = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_is_staff`, {
    method: 'POST', headers: headers(candidate.access_token), body: '{}'
  });
  const isStaff = await parse(staffResponse);
  if (isStaff !== true) throw new Error('Tu usuario no tiene acceso autorizado a StayClean');
  session = candidate;
  return { user: candidate.user };
}
export async function signOutAdmin() {
  const token = session?.access_token;
  session = null;
  if (token) {
    await fetch(`${STAYCLEAN_SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST', headers: headers(token)
    }).catch(() => {});
  }
}
export async function loadAdminProducts() {
  if (!session?.access_token) throw new Error('Debés iniciar sesión en StayClean');
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/products?select=id,sku,name,current_stock,sale_price,caviahue_cost,pricing_status,active&order=name.asc`, {
    headers: headers(session.access_token)
  });
  if (response.status === 401) { session = null; throw new Error('Sesión vencida: volvé a iniciar sesión'); }
  return parse(response);
}

async function readStaffTable(table, select, order = 'created_at.desc', limit = 250) {
  if (!session?.access_token) throw new Error('Debés iniciar sesión en StayClean');
  const query = new URLSearchParams({ select, order, limit: String(limit) });
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: headers(session.access_token)
  });
  if (response.status === 401) { session = null; throw new Error('Sesión vencida'); }
  return parse(response);
}
export const loadAdminPurchases = () => readStaffTable('purchases', 'id,date,supplier_name,total_final,status', 'date.desc');
export const loadAdminOrders = () => readStaffTable('orders', 'id,order_number,customer_name,total,status,created_at', 'created_at.desc');
export const loadAdminMovements = () => readStaffTable('inventory_movements', 'id,date,product_name,movement_type,quantity_base', 'date.desc');
