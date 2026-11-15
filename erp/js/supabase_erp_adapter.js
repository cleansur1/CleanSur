// StayClean: puente de lecturas centralizadas. No modifica datos ni localStorage.
import { STAYCLEAN_SUPABASE_URL, STAYCLEAN_PUBLISHABLE_KEY } from './supabase_public.js';
import { getAdminSession } from './supabase_admin.js';

export async function readCentral(table, { select = '*', order = 'created_at.desc', limit = 500 } = {}) {
  const session = getAdminSession();
  if (!session?.access_token) throw new Error('Sesión de Supabase requerida');
  const params = new URLSearchParams({select,order,limit:String(limit)});
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`}
  });
  if (!response.ok) throw new Error(`No se pudo leer ${table} desde Supabase (${response.status})`);
  return response.json();
}
export async function readCentralDashboard() {
  const session = getAdminSession();
  if (!session?.access_token) throw new Error('Sesión de Supabase requerida');
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_dashboard`,{
    method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:'{}'
  });
  if (!response.ok) throw new Error('No se pudo consultar el dashboard central');
  const data=await response.json();
  if (!data) throw new Error('Acceso administrativo denegado');
  return data;
}
export const centralTables = Object.freeze({
  products:'products',purchases:'purchases',sales:'sales',orders:'orders',customers:'customers',
  customer_account_movements:'customer_account_movements',inventory_movements:'inventory_movements',
  suppliers:'suppliers',price_lists:'price_lists',categories:'categories',expenses:'expenses',
  purchase_orders:'purchase_orders',cash_registers:'cash_registers',audit_log:'audit_log'
});

export async function updateCentralSalePrice(productId, salePrice) {
  const session=getAdminSession();
  if(!session?.access_token) throw new Error('Debés iniciar sesión en StayClean');
  if(!Number.isFinite(Number(salePrice)) || Number(salePrice)<=0) throw new Error('Precio inválido');
  const response=await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_update_product_price`,{
    method:'POST',
    headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_product_id:productId,p_sale_price:Number(salePrice)})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message || 'No se pudo modificar el precio');
  return data;
}
