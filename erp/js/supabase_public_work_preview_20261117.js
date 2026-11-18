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

export const staycleanPublicCatalog = () => rpc('stayclean_qa_public_catalog');
const AUTH_KEY='stayclean_qa_customer_auth_v1';
export const staycleanAuthSession=()=>{try{return JSON.parse(localStorage.getItem(AUTH_KEY)||'null')}catch{return null}};
const authFetch=async(path,body,token)=>{const r=await fetch(STAYCLEAN_SUPABASE_URL+path,{method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.msg||x.error_description||x.message||'Error de autenticación');return x};
export const staycleanAuthSignUp=async(email,password)=>authFetch('/auth/v1/signup',{email,password});
export const staycleanAuthSignIn=async(email,password)=>{const s=await authFetch('/auth/v1/token?grant_type=password',{email,password});if (s.user?.app_metadata?.stayclean_qa !== true) throw Error('Usá una cuenta autorizada para QA');localStorage.setItem(AUTH_KEY,JSON.stringify(s));return s};
export const staycleanAuthSignOut=async()=>{const s=staycleanAuthSession();if(s?.access_token)await authFetch('/auth/v1/logout',{},s.access_token).catch(()=>{});localStorage.removeItem(AUTH_KEY)};
export const staycleanAuthReset=email=>authFetch('/auth/v1/recover',{email});
export const staycleanAuthToken=async()=>{let s=staycleanAuthSession();if(!s?.access_token)return null;if(s.expires_at&&s.expires_at<Date.now()/1000+90){try{s=await authFetch('/auth/v1/token?grant_type=refresh_token',{refresh_token:s.refresh_token});localStorage.setItem(AUTH_KEY,JSON.stringify(s))}catch{localStorage.removeItem(AUTH_KEY);return null}}return s.access_token};
export const staycleanCustomerRpc=async(name,payload={})=>{const token=await staycleanAuthToken();if(!token)throw Error('Iniciá sesión con tu cuenta');const r=await fetch(STAYCLEAN_SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:STAYCLEAN_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.message||'No se pudo completar la operación');return x};
export const staycleanCustomerProfile=profile=>staycleanCustomerRpc('stayclean_qa_customer_profile',{p_profile:profile??null});
export const staycleanCustomerOrders = async () => [];
export const staycleanAuthenticatedOrder = async () => { throw Error('Este entorno admite únicamente Mercado Pago de prueba'); };

export const staycleanCreateMpCheckout = async (requestId, items) => {
  const token = await staycleanAuthToken();
  if (!token) throw Error('Iniciá sesión con tu cuenta para pagar');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/functions/v1/stayclean-qa-create-mp-checkout', {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId, items })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'No se pudo iniciar el pago');
  return data;
};

export const staycleanMpCheckoutStatus = async (requestId) => {
  const token = await staycleanAuthToken();
  if (!token) throw Error('Iniciá sesión nuevamente para consultar el pago');
  const response = await fetch(STAYCLEAN_SUPABASE_URL + '/functions/v1/stayclean-qa-get-mp-checkout-status', {
    method: 'POST',
    headers: { apikey: STAYCLEAN_PUBLISHABLE_KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: requestId })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || 'No se pudo consultar el estado del pago');
  return data;
};
