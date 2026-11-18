import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function response(status: number, body = "ok") {
  return new Response(body, { status, headers: { "Content-Type": "text/plain" } });
}

async function verifySignature(secret: string, signature: string, requestId: string, dataId: string) {
  const parts = new Map<string, string>();
  for (const part of signature.split(",")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    if (name !== "ts" && name !== "v1") continue;
    if (parts.has(name)) return false;
    parts.set(name, part.slice(separator + 1).trim());
  }
  const timestamp = parts.get("ts") ?? "";
  const digest = parts.get("v1") ?? "";
  if (!/^\d{10,13}$/.test(timestamp) || !/^[a-f\d]{64}$/i.test(digest)) return false;

  const encoder = new TextEncoder();
  const manifest = `id:${dataId};request-id:${requestId};ts:${timestamp};`;
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  const signatureBytes = Uint8Array.from(digest.match(/../g)!, (byte) => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, signatureBytes, encoder.encode(manifest));
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
    const signedIds = url.searchParams.getAll("data.id");
    const dataId = signedIds.length === 1 ? signedIds[0] : "";
    const signature = req.headers.get("x-signature") ?? "";
    const requestId = req.headers.get("x-request-id") ?? "";
    if (!dataId || !signature || !requestId) {
      console.warn("MP webhook rejected: missing signature fields", {
        hasDataId: Boolean(dataId),
        hasSignature: Boolean(signature),
        hasRequestId: Boolean(requestId),
      });
      return response(400, "missing signature data");
    }
    if (!await verifySignature(webhookSecret, signature, requestId, dataId)) {
      console.warn("MP webhook rejected: signature validation failed");
      return response(401, "invalid signature");
    }

    const orderResponse = await fetch(
      `https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,
      { headers: { Authorization: `Bearer ${mpToken}` } },
    );
    if (!orderResponse.ok) return response(502, "could not verify Mercado Pago order");
    const mpOrder = await orderResponse.json();
    if (mpOrder.id !== dataId) return response(502, "unexpected Mercado Pago order");
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
    if (!intent) return response(200, "ignored: unknown attempt");
    if (!intent.mp_order_id) return response(503, "checkout link not persisted yet");
    if (intent.mp_order_id !== mpOrder.id) return response(200, "ignored: order not linked");
    if (intent.status === "approved") return response(200, "already processed");
    if (intent.status === "fulfillment_review") return response(200, "already flagged for manual fulfillment review");

    const payment = mpOrder.transactions?.payments?.[0];
    const paidAmount = Number(mpOrder.total_paid_amount ?? payment?.paid_amount ?? 0);
    if (mpOrder.status === "processed" && mpOrder.status_detail === "accredited") {
      const { data, error } = await admin.rpc("stayclean_finalize_mp_payment", {
        p_intent_id: intent.id,
        p_mp_order_id: mpOrder.id,
        p_mp_status: mpOrder.status,
        p_mp_status_detail: mpOrder.status_detail,
        p_total_paid: paidAmount,
      });
      if (error) {
        console.error("Could not finalize paid StayClean order", error);
        return response(500, "paid order needs retry");
      }
      if (data?.requires_manual_review) {
        console.error("Paid StayClean order requires manual stock review", intent.id);
        return response(200, "payment accredited; fulfillment requires manual review");
      }
      return response(200, "payment confirmed");
    }

    if (["canceled", "failed"].includes(mpOrder.status)) {
      const { error: statusUpdateError } = await admin.from("stayclean_mp_payment_intents")
        .update({
          status: mpOrder.status === "canceled" ? "cancelled" : "rejected",
          mp_status: mpOrder.status,
          mp_status_detail: mpOrder.status_detail ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", intent.id)
        .eq("status", "pending");
      if (statusUpdateError) {
        console.error("Could not persist failed/cancelled MP status", statusUpdateError);
        return response(500, "payment status update needs retry");
      }
    }
    return response(200, "notification received");
  } catch (error) {
    console.error("mp-webhook", error);
    return response(500, "webhook processing error");
  }
});
