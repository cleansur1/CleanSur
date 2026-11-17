import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!mpToken) return reply(500, { error: "Falta configurar Mercado Pago en el servidor" });

    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) return reply(401, { error: "Iniciá sesión para pagar" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(jwt);
    if (userError || !userData.user) return reply(401, { error: "Sesión inválida o vencida" });

    const body = await req.json();
    const requestId = body?.request_id;
    const items = body?.items;
    if (typeof requestId !== "string" || !Array.isArray(items)) {
      return reply(400, { error: "Solicitud de compra inválida" });
    }

    const { data: intent, error: intentError } = await userClient.rpc(
      "stayclean_create_mp_payment_intent",
      { p_request_id: requestId, p_items: items },
    );
    if (intentError) return reply(400, { error: intentError.message });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: stored, error: storedError } = await admin
      .from("stayclean_mp_payment_intents")
      .select("id,mp_order_id,total_amount,items_snapshot,customer_snapshot,expires_at,status")
      .eq("id", intent.intent_id)
      .single();
    if (storedError || !stored) return reply(500, { error: "No se pudo recuperar el intento de pago" });
    if (stored.status !== "pending" || new Date(stored.expires_at).getTime() <= Date.now()) {
      return reply(409, { error: "El intento de compra venció. Volvé a iniciar el checkout." });
    }

    let mpOrder: any;
    if (stored.mp_order_id) {
      const existing = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(stored.mp_order_id)}`, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      if (!existing.ok) return reply(502, { error: "No se pudo recuperar la orden de Mercado Pago" });
      mpOrder = await existing.json();
    } else {
      const mpBody: Record<string, unknown> = {
        type: "online",
        processing_mode: "manual",
        capture_mode: "automatic",
        total_amount: Number(stored.total_amount).toFixed(2),
        external_reference: stored.id,
        expiration_time: "PT30M",
        config: { online: {
          success_url: `https://fedeeumann.github.io/StayClean-Test/tienda/?mp=success&request_id=${encodeURIComponent(requestId)}`,
          failure_url: `https://fedeeumann.github.io/StayClean-Test/tienda/?mp=failure&request_id=${encodeURIComponent(requestId)}`,
          pending_url: `https://fedeeumann.github.io/StayClean-Test/tienda/?mp=pending&request_id=${encodeURIComponent(requestId)}`,
          auto_return: "all"
        } },
        items: (stored.items_snapshot ?? []).map((line: any) => ({
          title: String(line.product_name).slice(0, 120),
          quantity: Number(line.quantity),
          unit_price: Number(line.unit_price).toFixed(2),
        })),
      };
      if (stored.customer_snapshot?.email) {
        mpBody.payer = { email: stored.customer_snapshot.email };
      }

      const mpResponse = await fetch("https://api.mercadopago.com/v1/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${mpToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": requestId,
        },
        body: JSON.stringify(mpBody),
      });
      const responseBody = await mpResponse.json().catch(() => ({}));
      if (!mpResponse.ok) {
        console.error("Mercado Pago create order error", mpResponse.status, responseBody);
        return reply(502, { error: "Mercado Pago no pudo crear el checkout", detail: responseBody.message ?? responseBody.error ?? "Error externo" });
      }
      mpOrder = responseBody;
      const { error: saveError } = await admin
        .from("stayclean_mp_payment_intents")
        .update({ mp_order_id: mpOrder.id, updated_at: new Date().toISOString() })
        .eq("id", stored.id)
        .eq("status", "pending");
      if (saveError) return reply(500, { error: "Se creó el checkout, pero no se pudo vincular a StayClean" });
    }

    const checkoutUrl = mpOrder.checkout_url;
    if (!checkoutUrl || !mpOrder.id) return reply(502, { error: "Mercado Pago no devolvió una URL de checkout válida" });
    return reply(200, { checkout_url: checkoutUrl, intent_id: stored.id, mp_order_id: mpOrder.id });
  } catch (error) {
    console.error("create-mp-checkout", error);
    return reply(500, { error: "Error interno al iniciar el pago" });
  }
});
