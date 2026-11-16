import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function response(status: number, body = "ok") {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

async function verifySignature(secret: string, signature: string, requestId: string, dataId: string) {
  const parts = Object.fromEntries(signature.split(",").map((part) => {
    const [key, value] = part.trim().split("=");
    return [key, value];
  }));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest)));
  const digest = Array.from(signed).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (digest.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < digest.length; i++) diff |= digest.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, "method not allowed");
  try {
    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    const webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!mpToken || !webhookSecret) return response(500, "webhook secrets not configured");

    const url = new URL(req.url);
    const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const signature = req.headers.get("x-signature") ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    if (!dataId || !signature || !requestId) return response(400, "missing signature data");
    if (!await verifySignature(webhookSecret, signature, requestId, dataId)) {
      return response(401, "invalid signature");
    }

    const orderResponse = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${mpToken}` } },
    );
    if (!orderResponse.ok) return response(502, "could not verify Mercado Pago order");
    const mpOrder = await orderResponse.json();
    if (mpOrder.live_mode !== false) return response(400, "unexpected live mode for test webhook");
    const intentId = mpOrder.external_reference;
    if (!intentId) return response(200, "ignored: no external reference");

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: intent, error: intentError } = await admin
      .from("stayclean_mp_payment_intents")
      .select("id,mp_order_id,status")
      .eq("id", intentId)
      .maybeSingle();
    if (intentError) return response(500, "intent lookup failed");
    if (!intent || intent.mp_order_id !== mpOrder.id) return response(200, "ignored: order not linked");
    if (intent.status === "approved") return response(200, "already processed");

    const payment = mpOrder.transactions?.payments?.[0];
    const paidAmount = Number(mpOrder.total_paid_amount ?? payment?.paid_amount ?? 0);
    if (mpOrder.status === "processed" && mpOrder.status_detail === "accredited") {
      const { error } = await admin.rpc("stayclean_finalize_mp_payment", {
        p_intent_id: intent.id,
        p_mp_order_id: mpOrder.id,
        p_mp_status: mpOrder.status,
        p_mp_status_detail: mpOrder.status_detail,
        p_total_paid: paidAmount,
      });
      if (error) {
        console.error("Could not finalize paid StayClean order", error);
        return response(500, "paid order needs retry or manual review");
      }
      return response(200, "payment confirmed");
    }

    if (["canceled", "failed"].includes(mpOrder.status)) {
      await admin.from("stayclean_mp_payment_intents")
        .update({
          status: mpOrder.status === "canceled" ? "cancelled" : "rejected",
          mp_status: mpOrder.status,
          mp_status_detail: mpOrder.status_detail ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "pending");
    }
    return response(200, "notification received");
  } catch (error) {
    console.error("mp-webhook", error);
    return response(500, "webhook processing error");
  }
});
