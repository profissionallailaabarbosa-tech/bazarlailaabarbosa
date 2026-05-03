import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseSignatureHeader(signatureHeader: string | null) {
  const parsed = { ts: "", v1: "" };
  for (const part of String(signatureHeader || "").split(",")) {
    const [rawKey, rawValue] = part.split("=", 2);
    const key = String(rawKey || "").trim();
    const value = String(rawValue || "").trim();
    if (key === "ts") parsed.ts = value;
    if (key === "v1") parsed.v1 = value;
  }
  return parsed;
}

function normalizeWebhookDataId(value: unknown) {
  const raw = String(value || "").trim();
  return /^[a-z0-9]+$/i.test(raw) ? raw.toLowerCase() : raw;
}

function normalizeTopic(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^topic_/, "")
    .replace(/_wh$/, "");
}

function normalizePaymentStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function createHmacSha256Hex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function validateMercadoPagoSignature(req: Request, body: Record<string, unknown>, webhookSecret: string) {
  const url = new URL(req.url);
  const signatureHeader = req.headers.get("x-signature");
  const requestId = req.headers.get("x-request-id");
  const { ts, v1 } = parseSignatureHeader(signatureHeader);
  const bodyData = body?.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : null;
  const dataId =
    normalizeWebhookDataId(url.searchParams.get("data.id")) ||
    normalizeWebhookDataId(bodyData?.id);

  if (!signatureHeader || !requestId || !ts || !v1 || !dataId) {
    return { ok: false, reason: "missing_signature_parts" };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const expected = await createHmacSha256Hex(webhookSecret, manifest);
  if (!constantTimeEqual(expected, String(v1).toLowerCase())) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const tsNumber = Number(ts);
  if (Number.isFinite(tsNumber)) {
    const signatureTimestampMs = tsNumber > 1_000_000_000_000 ? tsNumber : tsNumber * 1000;
    const ageMs = Math.abs(Date.now() - signatureTimestampMs);
    if (ageMs > 1000 * 60 * 10) {
      return { ok: false, reason: "stale_signature" };
    }
  }

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const mpToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    const webhookSecret = Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("PROJECT_URL");
    const serviceRole = Deno.env.get("SERVICE_ROLE_KEY");

    if (!mpToken || !supabaseUrl || !serviceRole) {
      return json(500, { error: "missing_secrets" });
    }

    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    let signatureValidation = webhookSecret ? "skipped_missing_signature_headers" : "skipped_missing_secret";
    const hasSignatureHeaders = Boolean(req.headers.get("x-signature") && req.headers.get("x-request-id"));

    if (webhookSecret && hasSignatureHeaders) {
      const validation = await validateMercadoPagoSignature(req, body as Record<string, unknown>, webhookSecret);
      if (!validation.ok) {
        return json(401, { error: "invalid_webhook_signature", reason: validation.reason });
      }
      signatureValidation = "validated";
    }

    const topic = normalizeTopic(
      body?.type ||
      String(body?.action || "").split(".", 2)[0] ||
      body?.topic ||
      url.searchParams.get("topic") ||
      url.searchParams.get("type"),
    );
    const resourceId =
      body?.data?.id ||
      url.searchParams.get("data.id") ||
      url.searchParams.get("id");

    if (!resourceId) {
      return json(200, { ignored: true });
    }

    const captureOrderPayment = async (payload: {
      orderId: number;
      paymentStatus: string;
      paymentId: string | null;
      paidAt?: string | null;
    }) => {
      const captureRes = await fetch(`${supabaseUrl}/rest/v1/rpc/capture_paid_order_with_stock`, {
        method: "POST",
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_order_id: payload.orderId,
          p_payment_status: payload.paymentStatus,
          p_payment_id: payload.paymentId,
          p_payment_provider: "mercado_pago",
          p_paid_at: payload.paidAt || new Date().toISOString(),
        }),
      });

      if (!captureRes.ok) {
        const txt = await captureRes.text();
        throw new Error(`order_capture_failed:${txt}`);
      }
    };

    const fetchMercadoPagoResource = async (resourceUrl: string) => {
      const response = await fetch(resourceUrl, {
        headers: { Authorization: `Bearer ${mpToken}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(JSON.stringify(data));
      }

      return data as Record<string, unknown>;
    };

    if (!topic || topic === "payment") {
      const payment = await fetchMercadoPagoResource(`https://api.mercadopago.com/v1/payments/${resourceId}`);
      const orderId = payment.external_reference;

      if (!orderId) {
        return json(200, { ignored: true, reason: "missing_external_reference", signature_validation: signatureValidation });
      }

      const parsedOrderId = Number(orderId);
      if (!Number.isFinite(parsedOrderId)) {
        return json(200, { ignored: true, reason: "invalid_external_reference", signature_validation: signatureValidation });
      }

      await captureOrderPayment({
        orderId: parsedOrderId,
        paymentStatus: String(payment.status || ""),
        paymentId: payment.id ? String(payment.id) : null,
        paidAt: String(payment.date_approved || payment.date_last_updated || payment.date_created || ""),
      });

      return json(200, {
        ok: true,
        topic: "payment",
        order_id: orderId,
        payment_status: payment.status,
        signature_validation: signatureValidation,
      });
    }

    if (topic === "merchant_order") {
      const merchantOrder = await fetchMercadoPagoResource(`https://api.mercadopago.com/merchant_orders/${resourceId}`);
      const orderId = merchantOrder.external_reference;

      if (!orderId) {
        return json(200, { ignored: true, reason: "missing_external_reference", topic, signature_validation: signatureValidation });
      }

      const parsedOrderId = Number(orderId);
      if (!Number.isFinite(parsedOrderId)) {
        return json(200, { ignored: true, reason: "invalid_external_reference", topic, signature_validation: signatureValidation });
      }

      const payments = Array.isArray(merchantOrder.payments) ? merchantOrder.payments as Record<string, unknown>[] : [];
      const approvedPayments = payments.filter((payment) => normalizePaymentStatus(payment.status) === "approved");
      const approvedAmount = approvedPayments.reduce((sum, payment) => {
        return sum + Number(payment.total_paid_amount ?? payment.transaction_amount ?? 0);
      }, 0);
      const merchantOrderTotal = Number(merchantOrder.total_amount || 0);
      const latestPayment = [...payments].sort((a, b) => {
        const aTime = new Date(String(a.date_approved || a.date_created || 0)).getTime();
        const bTime = new Date(String(b.date_approved || b.date_created || 0)).getTime();
        return bTime - aTime;
      })[0] || null;
      const latestApprovedPayment = [...approvedPayments].sort((a, b) => {
        const aTime = new Date(String(a.date_approved || a.date_created || 0)).getTime();
        const bTime = new Date(String(b.date_approved || b.date_created || 0)).getTime();
        return bTime - aTime;
      })[0] || null;

      const paymentToCapture =
        latestApprovedPayment && (merchantOrderTotal <= 0 || approvedAmount >= merchantOrderTotal)
          ? {
              paymentStatus: "approved",
              paymentId: latestApprovedPayment.id ? String(latestApprovedPayment.id) : null,
              paidAt: String(latestApprovedPayment.date_approved || latestApprovedPayment.date_created || ""),
            }
          : latestPayment
            ? {
                paymentStatus: String(latestPayment.status || merchantOrder.status || "pending"),
                paymentId: latestPayment.id ? String(latestPayment.id) : null,
                paidAt: String(latestPayment.date_last_updated || latestPayment.date_created || ""),
              }
            : {
                paymentStatus: String(merchantOrder.status || "pending"),
                paymentId: null,
                paidAt: new Date().toISOString(),
              };

      await captureOrderPayment({
        orderId: parsedOrderId,
        paymentStatus: paymentToCapture.paymentStatus,
        paymentId: paymentToCapture.paymentId,
        paidAt: paymentToCapture.paidAt,
      });

      return json(200, {
        ok: true,
        topic: "merchant_order",
        order_id: orderId,
        payment_status: paymentToCapture.paymentStatus,
        signature_validation: signatureValidation,
      });
    }

    return json(200, { ignored: true, topic, signature_validation: signatureValidation });
  } catch (e) {
    return json(500, { error: "internal_error", message: e instanceof Error ? e.message : "unknown" });
  }
});
