import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  const dispatch = request.headers.get("x-cleansur-dispatch");
  if (request.method !== "POST" || !dispatch) return new Response(null, { status: 403 });

  const batch = await db.rpc("cleansur_claim_order_push", { p_dispatch: dispatch });
  if (batch.error) return new Response(null, { status: batch.error.code === "42501" ? 403 : 503 });

  const keys = db.from("cleansur_push_keys");
  let key = await keys.select("public_key,private_key").single();
  if (key.error?.code === "PGRST116") {
    const generated = webpush.generateVAPIDKeys();
    await keys.upsert({ public_key: generated.publicKey, private_key: generated.privateKey },
      { onConflict: "singleton", ignoreDuplicates: true });
    key = await keys.select("public_key,private_key").single();
  }
  if (key.error) return new Response(null, { status: 503 });

  const vapidDetails = {
    subject: "https://cleansur1.github.io/CleanSur/",
    publicKey: key.data.public_key,
    privateKey: key.data.private_key,
  };

  await Promise.all(batch.data.map(async (delivery: {
    order_id: string; endpoint: string; p256dh: string; auth_secret: string;
  }) => {
    let status = "sent";
    try {
      await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret },
      }, JSON.stringify({ orderId: delivery.order_id }), { vapidDetails, TTL: 86400, timeout: 8000 });
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await db.from("cleansur_push_devices").delete().eq("endpoint", delivery.endpoint);
        return;
      }
      // A timeout can follow provider acceptance. Keep the claim to avoid a second alert.
      status = "failed";
    }
    const result = await db.from("cleansur_push_deliveries").update({ status })
      .eq("order_id", delivery.order_id).eq("endpoint", delivery.endpoint);
    if (result.error) console.error("Could not record push outcome", result.error.code);
  }));
  return new Response(null, { status: 204 });
});
