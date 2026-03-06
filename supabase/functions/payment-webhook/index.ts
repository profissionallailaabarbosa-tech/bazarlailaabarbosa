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

    const isApproved = mp.status === "approved";
    const orderStatus = isApproved ? "Pago" : "Pendente";

    const updatePayload: Record<string, unknown> = {
      payment_provider: "mercado_pago",
      payment_id: String(mp.id),
      payment_status: String(mp.status),
      status: orderStatus,
    };

    if (isApproved) {
      updatePayload.paid_at = new Date().toISOString();
    }

    const upRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}`, {
      method: "PATCH",
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(updatePayload),
    });

    if (!upRes.ok) {
      const txt = await upRes.text();
      return json(400, { error: "order_update_failed", details: txt });
    }

    return json(200, { ok: true, order_id: orderId, payment_status: mp.status });
  } catch (e) {
    return json(500, { error: "internal_error", message: e instanceof Error ? e.message : "unknown" });
  }
});

