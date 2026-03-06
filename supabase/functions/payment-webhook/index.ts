import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const serviceRole = Deno.env.get("SERVICE_ROLE_KEY");

    if (!mpToken || !supabaseUrl || !serviceRole) {
      return json(500, { error: "missing_secrets" });
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const topic = body?.type || url.searchParams.get("topic");
    const paymentId =
      body?.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    if (!paymentId || (topic && topic !== "payment")) {
      return json(200, { ignored: true });
    }

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mpToken}` },
    });
    const mp = await mpRes.json();

    if (!mpRes.ok) {
      return json(400, { error: "mp_payment_fetch_failed", details: mp });
    }

    const orderId = mp.external_reference;
    if (!orderId) {
      return json(200, { ignored: true, reason: "missing_external_reference" });
    }

    const parsedOrderId = Number(orderId);
    if (!Number.isFinite(parsedOrderId)) {
      return json(200, { ignored: true, reason: "invalid_external_reference" });
    }

    const captureRes = await fetch(`${supabaseUrl}/rest/v1/rpc/capture_paid_order_with_stock`, {
      method: "POST",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        p_order_id: parsedOrderId,
        p_payment_status: String(mp.status),
        p_payment_id: String(mp.id),
        p_payment_provider: "mercado_pago",
        p_paid_at: new Date().toISOString(),
      }),
    });

    if (!captureRes.ok) {
      const txt = await captureRes.text();
      return json(400, { error: "order_capture_failed", details: txt });
    }

    return json(200, { ok: true, order_id: orderId, payment_status: mp.status });
  } catch (e) {
    return json(500, { error: "internal_error", message: e instanceof Error ? e.message : "unknown" });
  }
});

