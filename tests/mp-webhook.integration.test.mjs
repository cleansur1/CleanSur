import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { createHmac, webcrypto } from 'node:crypto';

// Runs the repository's actual webhook source with mocked external dependencies.
// Run: node --test tests/mp-webhook.integration.test.mjs
const source = stripTypeScriptTypes(
  readFileSync(new URL('../supabase/functions/mp-webhook/index.ts', import.meta.url), 'utf8')
    .replace(/^import .*;$/gm, ''),
);

function signature(dataId, requestId, secret='test-secret') {
  const ts='1234567890';
  const manifest=`id:${dataId};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
}
function setup({status='processed',detail='accredited',stockReview=false,dbError=false,liveMode=false,mpOrderId='ORDTST123'}={}) {
  const state={finalizations:0,updates:0,lastUpdate:null,fetches:0,intentStatus:'pending',orderId:mpOrderId};
  const mpOrder={id:mpOrderId,live_mode:liveMode,external_reference:'11111111-1111-4111-8111-111111111111',status,status_detail:detail,total_paid_amount:100};
  const admin={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{id:mpOrder.external_reference,mp_order_id:state.orderId,status:state.intentStatus},error:null})})}),update:payload=>({eq:()=>({eq:async()=>{state.updates++;state.lastUpdate=payload;return {error:dbError?{message:'db unavailable'}:null}}})})}),rpc:async()=>{state.finalizations++;if(!stockReview && !dbError)state.intentStatus='approved';if(stockReview)state.intentStatus='fulfillment_review';return {data:stockReview?{requires_manual_review:true}:{success:true},error:dbError?{message:'db unavailable'}:null}}};
  let handler;
  const ctx={Deno:{env:{get:k=>({MERCADOPAGO_ACCESS_TOKEN:'fake',MERCADOPAGO_WEBHOOK_SECRET:'test-secret',SUPABASE_URL:'https://example.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake'})[k]},serve:fn=>{handler=fn}},createClient:()=>admin,fetch:async()=>{state.fetches++;return {ok:true,json:async()=>mpOrder}},Response,URL,TextEncoder,Uint8Array,crypto:webcrypto,console};
  vm.runInNewContext(source,ctx,{filename:'mp-webhook/index.ts'});
  const send = ({id=mpOrderId, signed=true, method='POST', query, signedId=id}={}) =>
    handler(new Request(`https://example.invalid/mp-webhook?${query ?? `data.id=${id}`}`, {
      method,
      headers: {
        'x-request-id': 'req-1',
        'x-signature': signed ? signature(signedId, 'req-1') : 'ts=1234567890,v1=invalid',
      },
    }));
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

test('signed live-mode payment finalizes when configured credentials can retrieve it',async()=>{const x=setup({liveMode:true});assert.equal((await x.send()).status,200);assert.equal(x.state.finalizations,1)});
test('mismatched Mercado Pago order is ignored',async()=>{const x=setup();x.state.orderId='another-order';assert.equal((await x.send()).status,200);assert.equal(x.state.finalizations,0)});

test('the signed mixed-case resource ID is preserved', async () => {
  const x = setup({mpOrderId: 'ORDTSTAbC123'});
  assert.equal((await x.send()).status, 200);
  assert.equal(x.state.finalizations, 1);
});
test('only one canonical query data.id is accepted', async () => {
  const x = setup();
  assert.equal((await x.send({query: 'id=ORDTST123'})).status, 400);
  assert.equal((await x.send({query: 'data.id=ORDTST123&data.id=ORDTST123'})).status, 400);
  assert.equal(x.state.fetches, 0);
});
test('canceled order updates the intent without finalizing', async () => {
  const x = setup({status: 'canceled', detail: 'canceled'});
  assert.equal((await x.send()).status, 200);
  assert.equal(x.state.lastUpdate.status, 'cancelled');
  assert.equal(x.state.finalizations, 0);
});
test('a notification arriving before the order link is persisted gets a retry', async () => {
  const x = setup();
  x.state.orderId = null;
  assert.equal((await x.send()).status, 503);
  assert.equal(x.state.finalizations, 0);
});
