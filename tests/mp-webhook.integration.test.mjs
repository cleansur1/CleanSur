import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createHmac, webcrypto } from 'node:crypto';

// Runs the repository's actual webhook source with mocked external dependencies.
// Run: node --test tests/mp-webhook.integration.test.mjs
const source = readFileSync(new URL('../supabase/functions/mp-webhook/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\s*$/gm, '')
  .replace('function response(status: number, body = "ok")', 'function response(status, body = "ok")')
  .replace('async function verifySignature(secret: string, signature: string, requestId: string, dataId: string)', 'async function verifySignature(secret, signature, requestId, dataId)')
  .replace('const parts: Record<string, string> = {}', 'const parts = {}')
  .replace('Deno.serve(async (req: Request) =>', 'Deno.serve(async (req) =>')
  .replaceAll('Deno.env.get("SUPABASE_URL")!', 'Deno.env.get("SUPABASE_URL")')
  .replaceAll('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!', 'Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');

function signature(dataId, requestId, secret='test-secret') {
  const ts='1234567890';
  const manifest=`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
}
function setup({status='processed',detail='accredited',stockReview=false,dbError=false}={}) {
  const state={finalizations:0,updates:0,fetches:0,intentStatus:'pending',orderId:'order-123'};
  const mpOrder={id:'order-123',live_mode:false,external_reference:'11111111-1111-4111-8111-111111111111',status,status_detail:detail,total_paid_amount:100};
  const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:mpOrder.external_reference,mp_order_id:state.orderId,status:state.intentStatus},error:null})})}),update:()=>({eq:()=>({eq:async()=>{state.updates++;return {error:dbError?{message:'db unavailable'}:null}}})})}),rpc:async()=>{state.finalizations++;if(!stockReview && !dbError)state.intentStatus='approved';if(stockReview)state.intentStatus='fulfillment_review';return {data:stockReview?{requires_manual_review:true}:{success:true},error:dbError?{message:'db unavailable'}:null}}};
  let handler;
  const ctx={Deno:{env:{get:k=>({MERCADOPAGO_ACCESS_TOKEN:'fake',MERCADOPAGO_WEBHOOK_SECRET:'test-secret',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake'})[k]},serve:fn=>{handler=fn}},createClient:()=>admin,fetch:async()=>{state.fetches++;return {ok:true,json:async()=>mpOrder}},Response,URL,TextEncoder,Uint8Array,crypto:webcrypto,console};
  vm.runInNewContext(source,ctx,{filename:'mp-webhook/index.ts'});
  const send=({id='order-123',signed=true,method='POST'}={})=>handler(new Request(`https://example.invalid/mp-webhook?data.id=${id}`,{method,headers:{'x-request-id':'req-1','x-signature':signed?signature(id,'req-1'):'ts=1234567890,v1=invalid'}}));
  return {send,state};
}
test('approved payment finalizes exactly once on repeated notifications',async()=>{const x=setup();assert.equal((await x.send()).status,200);assert.equal((await x.send()).status,200);assert.equal(x.state.finalizations,1)});
test('invalid HMAC never reaches Mercado Pago or database',async()=>{const x=setup();assert.equal((await x.send({signed:false})).status,401);assert.equal(x.state.fetches,0);assert.equal(x.state.finalizations,0)});
test('pending payment does not finalize',async()=>{const x=setup({status:'action_required',detail:'waiting_payment'});assert.equal((await x.send()).status,200);assert.equal(x.state.finalizations,0)});
test('failed payment updates rejected state',async()=>{const x=setup({status:'failed',detail:'rejected'});assert.equal((await x.send()).status,200);assert.equal(x.state.updates,1)});
test('database update error requests webhook retry',async()=>{const x=setup({status:'failed',dbError:true});assert.equal((await x.send()).status,500)});
test('paid but unavailable stock enters review without retry storm',async()=>{const x=setup({stockReview:true});assert.equal((await x.send()).status,200);assert.equal((await x.send()).status,200);assert.equal(x.state.finalizations,1)});
test('database finalization error requests retry',async()=>{const x=setup({dbError:true});assert.equal((await x.send()).status,500)});
test('non-POST request is rejected',async()=>{const x=setup();assert.equal((await x.send({method:'GET'})).status,405)});
