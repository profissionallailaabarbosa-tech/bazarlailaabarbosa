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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const mpAccessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return jsonResponse(500, { error: "Missing MERCADO_PAGO_ACCESS_TOKEN secret" });
    }

    const payload = (await req.json()) as CreatePaymentPayload;
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

    const preferenceBody = {
      items: normalizedItems,
      payer: payload.payer_email ? { email: payload.payer_email } : undefined,
      external_reference: payload.external_reference || (payload.order_id ? String(payload.order_id) : undefined),
      back_urls: {
        success: payload.success_url,
        pending: payload.pending_url,
        failure: payload.failure_url,
      },
      auto_return: "approved",
      notification_url: payload.notification_url,
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
