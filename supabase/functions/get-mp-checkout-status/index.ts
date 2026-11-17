import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply(405, { error: "Método no permitido" });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return reply(401, { error: "Iniciá sesión para consultar tu pedido" });

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(jwt);
    if (authError || !authData.user) return reply(401, { error: "Sesión inválida" });

    const body = await req.json();
    if (typeof body?.request_id !== "string") return reply(400, { error: "Identificador inválido" });

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: intent, error } = await admin
      .from("stayclean_mp_payment_intents")
      .select("status,mp_status,order_id")
      .eq("request_id", body.request_id)
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (error) return reply(500, { error: "No se pudo consultar el pedido" });
    if (!intent) return reply(404, { error: "No encontramos este intento de pago" });

    let orderNumber: string | null = null;
    if (intent.order_id) {
      const { data: order } = await admin.from("orders")
        .select("order_number").eq("id", intent.order_id).maybeSingle();
      orderNumber = order?.order_number ?? null;
    }
    return reply(200, {
      status: intent.status,
      mp_status: intent.mp_status,
      order_number: orderNumber,
    });
  } catch (error) {
    console.error("get-mp-checkout-status", error);
    return reply(500, { error: "Error interno al consultar el pago" });
  }
});
