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

export async function editCentralProduct(productId, changes, expectedStock) {
  const session = getAdminSession();
  if (!session?.access_token) throw new Error('Volvé a iniciar sesión en CleanSur');
  const response = await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_edit_product`, {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_product_id: productId,
      p_changes: changes,
      p_expected_stock: expectedStock,
      p_request_id: crypto.randomUUID()
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'No se pudo guardar el producto');
  return data;
}

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

export async function adjustCentralStock(productId, delta, reason, requestId=crypto.randomUUID()) {
  const session=getAdminSession();
  if(!session?.access_token) throw new Error('Debés iniciar sesión en StayClean');
  if(!Number.isInteger(Number(delta)) || Number(delta)===0) throw new Error('Cantidad entera distinta de cero requerida');
  if(String(reason||'').trim().length<8) throw new Error('Indicá un motivo de al menos 8 caracteres');
  const response=await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_adjust_stock`,{
    method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_product_id:productId,p_delta:Number(delta),p_reason:reason,p_request_id:requestId})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'No se pudo ajustar el stock');
  return data;
}

export async function setCentralStock(productId, expectedStock, newStock, reason, requestId=crypto.randomUUID()) {
  const session=getAdminSession();
  if(!session?.access_token) throw new Error('Debés iniciar sesión en StayClean');
  if(!Number.isInteger(Number(expectedStock)) || !Number.isInteger(Number(newStock)) || Number(newStock)<0) throw new Error('El conteo debe ser un número entero no negativo');
  if(String(reason||'').trim().length<8) throw new Error('Indicá un motivo de al menos 8 caracteres');
  const response=await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_set_stock`,{
    method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_product_id:productId,p_expected_stock:Number(expectedStock),p_new_stock:Number(newStock),p_reason:reason,p_request_id:requestId})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'No se pudo registrar el conteo');
  return data;
}

export async function createCentralSale(sale, requestId=crypto.randomUUID()) {
  const session=getAdminSession();
  if(!session?.access_token) throw new Error('Iniciá sesión en StayClean');
  const payload={...sale,request_id:requestId};
  const response=await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_create_sale`,{
    method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_sale:payload})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'No se pudo registrar la venta');
  return data;
}

export async function receiveCentralPurchase(purchase, requestId=crypto.randomUUID()) {
  const session=getAdminSession();
  if(!session?.access_token) throw new Error('Iniciá sesión en StayClean');
  const response=await fetch(`${STAYCLEAN_SUPABASE_URL}/rest/v1/rpc/stayclean_staff_receive_purchase`,{
    method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
    body:JSON.stringify({p_purchase:{...purchase,request_id:requestId}})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.message||'No se pudo recibir la compra');
  return data;
}
