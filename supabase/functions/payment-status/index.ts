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

function normalizePaymentStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function getPaymentTimestamp(payment: Record<string, unknown> | null) {
  return (
    String(payment?.date_approved || "") ||
    String(payment?.date_last_updated || "") ||
    String(payment?.date_created || "")
  );
}

function pickBestPayment(results: unknown[]) {
  const payments = Array.isArray(results) ? [...results] : [];
  if (!payments.length) return null;

  payments.sort((a, b) => {
    const aTime = new Date(getPaymentTimestamp(a as Record<string, unknown>) || 0).getTime();
    const bTime = new Date(getPaymentTimestamp(b as Record<string, unknown>) || 0).getTime();
    return bTime - aTime;
  });

  const approvedPayment = payments.find((payment) =>
    normalizePaymentStatus((payment as Record<string, unknown>)?.status) === "approved"
  );

  if (approvedPayment) return approvedPayment as Record<string, unknown>;
  return (payments[0] || null) as Record<string, unknown> | null;
}

function pickMerchantOrder(results: Record<string, unknown>[]) {
  const merchantOrders = Array.isArray(results) ? [...results] : [];
  if (!merchantOrders.length) return null;

  merchantOrders.sort((a, b) => {
    const aTime = new Date(String(a.last_updated || a.date_created || 0)).getTime();
    const bTime = new Date(String(b.last_updated || b.date_created || 0)).getTime();
    return bTime - aTime;
  });

  return merchantOrders[0] || null;
}

function toPublicOrder(order: Record<string, unknown> | null) {
  if (!order) return null;
  return {
    id: order.id,
    status: order.status,
    payment_status: order.payment_status,
    delivery_method: order.delivery_method,
    total_amount: order.total_amount,
    items: order.items,
  };
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

    if (normalizePaymentStatus(initialOrder.payment_status) === "approved") {
      return json(200, {
        ok: true,
        order: toPublicOrder(initialOrder),
        mp_payment_status: "approved",
        mp_payment_id: initialOrder.payment_id ? String(initialOrder.payment_id) : null,
        found_payment: true,
      });
    }

    const orderPhone = digitsOnly(initialOrder.customer_phone);
    const shouldValidatePhone = customerPhone.length >= 10;
    const phoneMatches =
      !shouldValidatePhone ||
      orderPhone === customerPhone ||
      orderPhone === customerPhone.slice(-11) ||
      orderPhone.slice(-11) === customerPhone.slice(-11);

    if (shouldValidatePhone && !phoneMatches) {
      return json(403, { error: "unauthorized_order_access" });
    }

    const mpSearchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=10`, {
      headers: {
        Authorization: `Bearer ${mpToken}`,
      },
    });

    const mpSearchData = await mpSearchRes.json();
    if (!mpSearchRes.ok) {
      return json(400, { error: "mp_payment_search_failed", details: mpSearchData, order: toPublicOrder(initialOrder) });
    }

    const selectedPayment = pickBestPayment(mpSearchData?.results || []);
    let fallbackMerchantOrder: Record<string, unknown> | null = null;

    if (!selectedPayment || normalizePaymentStatus(selectedPayment.status) !== "approved") {
      const merchantOrderSearchRes = await fetch(`https://api.mercadopago.com/merchant_orders/search?external_reference=${orderId}`, {
        headers: {
          Authorization: `Bearer ${mpToken}`,
        },
      });

      const merchantOrderSearchData = await merchantOrderSearchRes.json().catch(() => ({}));
      if (merchantOrderSearchRes.ok) {
        const merchantOrderResults = Array.isArray(merchantOrderSearchData?.elements)
          ? merchantOrderSearchData.elements
          : Array.isArray(merchantOrderSearchData?.results)
            ? merchantOrderSearchData.results
            : [];
        fallbackMerchantOrder = pickMerchantOrder(merchantOrderResults as Record<string, unknown>[]);
      }
    }

    if (selectedPayment?.id && selectedPayment?.status) {
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
          p_payment_status: String(selectedPayment.status),
          p_payment_id: String(selectedPayment.id),
          p_payment_provider: "mercado_pago",
          p_paid_at: getPaymentTimestamp(selectedPayment) || new Date().toISOString(),
        }),
      });

      if (!captureRes.ok) {
        return json(400, {
          error: "order_capture_failed",
          details: await captureRes.text(),
          mp_status: selectedPayment.status,
          mp_payment_id: selectedPayment.id,
          order: toPublicOrder(initialOrder),
        });
      }
    } else if (fallbackMerchantOrder) {
      const merchantOrderPayments = Array.isArray(fallbackMerchantOrder.payments)
        ? fallbackMerchantOrder.payments as Record<string, unknown>[]
        : [];
      const approvedPayments = merchantOrderPayments.filter((payment) => normalizePaymentStatus(payment.status) === "approved");
      const approvedAmount = approvedPayments.reduce((sum, payment) => {
        return sum + Number(payment.total_paid_amount ?? payment.transaction_amount ?? 0);
      }, 0);
      const merchantOrderTotal = Number(fallbackMerchantOrder.total_amount || initialOrder.total_amount || 0);
      const latestApprovedPayment = approvedPayments.sort((a, b) => {
        const aTime = new Date(getPaymentTimestamp(a) || 0).getTime();
        const bTime = new Date(getPaymentTimestamp(b) || 0).getTime();
        return bTime - aTime;
      })[0] || null;

      if (latestApprovedPayment && (merchantOrderTotal <= 0 || approvedAmount >= merchantOrderTotal)) {
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
            p_payment_status: "approved",
            p_payment_id: latestApprovedPayment.id ? String(latestApprovedPayment.id) : null,
            p_payment_provider: "mercado_pago",
            p_paid_at: getPaymentTimestamp(latestApprovedPayment) || new Date().toISOString(),
          }),
        });

        if (!captureRes.ok) {
          return json(400, {
            error: "order_capture_failed",
            details: await captureRes.text(),
            mp_status: "approved",
            mp_payment_id: latestApprovedPayment.id,
            order: toPublicOrder(initialOrder),
          });
        }
      }
    }

    const freshOrder = await fetchOrder();
    const fallbackApprovedPayment = Array.isArray(fallbackMerchantOrder?.payments)
      ? (fallbackMerchantOrder?.payments as Record<string, unknown>[]).find((payment) => normalizePaymentStatus(payment.status) === "approved") || null
      : null;

    return json(200, {
      ok: true,
      order: toPublicOrder(freshOrder),
      mp_payment_status: selectedPayment?.status || fallbackApprovedPayment?.status || null,
      mp_payment_id:
        selectedPayment?.id
          ? String(selectedPayment.id)
          : fallbackApprovedPayment?.id
            ? String(fallbackApprovedPayment.id)
            : null,
      found_payment: !!selectedPayment || !!fallbackMerchantOrder,
    });
  } catch (error) {
    return json(500, {
      error: "internal_error",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
});
