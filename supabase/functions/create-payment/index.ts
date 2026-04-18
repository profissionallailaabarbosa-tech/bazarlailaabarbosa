import "@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PaymentItem = {
  id?: string | number;
  title: string;
  quantity: number;
  unit_price: number;
  currency_id?: string;
};

type CreatePaymentPayload = {
  order_id?: number;
  external_reference?: string;
  payer_email?: string;
  items: PaymentItem[];
  success_url?: string;
  pending_url?: string;
  failure_url?: string;
  notification_url?: string;
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toCents(value: number) {
  return Math.round(Number(value || 0) * 100);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const serviceRole = Deno.env.get("SERVICE_ROLE_KEY");
    if (!mpAccessToken || !supabaseUrl || !serviceRole) {
      return jsonResponse(500, { error: "missing_required_secrets" });
    }

    const payload = (await req.json()) as CreatePaymentPayload;
    if (!Number.isFinite(Number(payload?.order_id))) {
      return jsonResponse(400, { error: "order_id is required" });
    }
    if (!Array.isArray(payload?.items) || payload.items.length === 0) {
      return jsonResponse(400, { error: "items is required" });
    }

    for (const item of payload.items) {
      if (!item?.title || !Number.isFinite(Number(item?.quantity)) || !Number.isFinite(Number(item?.unit_price))) {
        return jsonResponse(400, { error: "invalid item payload" });
      }
    }

    const normalizedItems = payload.items.map((item) => ({
      id: item.id ? String(item.id) : undefined,
      title: String(item.title),
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      currency_id: item.currency_id || "BRL",
    }));

    const orderId = Number(payload.order_id);
    const orderRes = await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${orderId}&select=id,status,payment_status,total_amount`, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
        "Content-Type": "application/json",
      },
    });

    if (!orderRes.ok) {
      return jsonResponse(400, { error: "order_lookup_failed", details: await orderRes.text() });
    }

    const orderRows = await orderRes.json();
    const order = Array.isArray(orderRows) ? orderRows[0] || null : null;

    if (!order) {
      return jsonResponse(404, { error: "order_not_found" });
    }

    if (String(order.payment_status || "").toLowerCase() === "approved") {
      return jsonResponse(409, { error: "order_already_paid" });
    }

    if (String(order.status || "").toLowerCase() === "expirado") {
      return jsonResponse(409, { error: "order_expired" });
    }

    const expectedExternalReference = String(orderId);
    if (payload.external_reference && String(payload.external_reference) !== expectedExternalReference) {
      return jsonResponse(400, { error: "external_reference_mismatch" });
    }

    const payloadTotalCents = normalizedItems.reduce(
      (sum, item) => sum + toCents(item.unit_price) * Number(item.quantity || 0),
      0,
    );
    const orderTotalCents = toCents(Number(order.total_amount || 0));

    if (payloadTotalCents !== orderTotalCents) {
      return jsonResponse(400, {
        error: "order_total_mismatch",
        expected_total: Number(order.total_amount || 0),
        received_total: payloadTotalCents / 100,
      });
    }

    const fallbackNotificationUrl = Deno.env.get("MP_WEBHOOK_URL");

    const preferenceBody = {
      items: normalizedItems,
      payer: payload.payer_email ? { email: payload.payer_email } : undefined,
      external_reference: expectedExternalReference,
      back_urls: {
        success: payload.success_url,
        pending: payload.pending_url,
        failure: payload.failure_url,
      },
      auto_return: "approved",
      notification_url: payload.notification_url || fallbackNotificationUrl,
      metadata: payload.order_id ? { order_id: payload.order_id } : undefined,
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(preferenceBody),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      return jsonResponse(400, {
        error: "failed_to_create_preference",
        details: mpData,
      });
    }

    return jsonResponse(200, {
      provider: "mercado_pago",
      preference_id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    });
  } catch (error) {
    return jsonResponse(500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "unknown error",
    });
  }
});
