import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function digitsOnly(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const serviceRole = Deno.env.get("SERVICE_ROLE_KEY");

    if (!mpToken || !supabaseUrl || !serviceRole) {
      return json(500, { error: "missing_secrets" });
    }

    const body = await req.json().catch(() => ({}));
    const orderId = Number(body?.order_id);
    const customerPhone = digitsOnly(body?.customer_phone);
    if (!Number.isFinite(orderId)) {
      return json(400, { error: "invalid_order_id" });
    }
    if (customerPhone.length < 10) {
      return json(400, { error: "invalid_customer_phone" });
    }

    const fetchOrder = async () => {
      const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=id,status,payment_status,payment_id,paid_at,customer_name,customer_phone,delivery_method,total_amount,items`, {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
        },
      });

      if (!orderRes.ok) {
        throw new Error(`order_fetch_failed:${await orderRes.text()}`);
      }

      const rows = await orderRes.json();
      return Array.isArray(rows) ? rows[0] || null : null;
    };

    const initialOrder = await fetchOrder();
    if (!initialOrder) {
      return json(404, { error: "order_not_found" });
    }

    const orderPhone = digitsOnly(initialOrder.customer_phone);
    const phoneMatches =
      orderPhone === customerPhone ||
      orderPhone === customerPhone.slice(-11) ||
      orderPhone.slice(-11) === customerPhone.slice(-11);

    if (!phoneMatches) {
      return json(403, { error: "unauthorized_order_access" });
    }

    const mpSearchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=1`, {
      headers: {
        Authorization: `Bearer ${mpToken}`,
      },
    });

    const mpSearchData = await mpSearchRes.json();
    if (!mpSearchRes.ok) {
      return json(400, { error: "mp_payment_search_failed", details: mpSearchData, order: initialOrder });
    }

    const latestPayment = mpSearchData?.results?.[0] || null;

    if (latestPayment?.id && latestPayment?.status) {
      const captureRes = await fetch(`${supabaseUrl}/rest/v1/rpc/capture_paid_order_with_stock`, {
        method: "POST",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_order_id: orderId,
          p_payment_status: String(latestPayment.status),
          p_payment_id: String(latestPayment.id),
          p_payment_provider: "mercado_pago",
          p_paid_at: new Date().toISOString(),
        }),
      });

      if (!captureRes.ok) {
        return json(400, {
          error: "order_capture_failed",
          details: await captureRes.text(),
          mp_status: latestPayment.status,
          mp_payment_id: latestPayment.id,
          order: initialOrder,
        });
      }
    }

    const freshOrder = await fetchOrder();

    return json(200, {
      ok: true,
      order: freshOrder,
      mp_payment_status: latestPayment?.status || null,
      mp_payment_id: latestPayment?.id ? String(latestPayment.id) : null,
      found_payment: !!latestPayment,
    });
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
});
