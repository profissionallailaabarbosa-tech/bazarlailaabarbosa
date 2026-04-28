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
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNumber);
    if (ageSeconds > 60 * 10) {
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

    if (webhookSecret) {
      const validation = await validateMercadoPagoSignature(req, body as Record<string, unknown>, webhookSecret);
      if (!validation.ok) {
        return json(401, { error: "invalid_webhook_signature", reason: validation.reason });
      }
    }

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

    return json(200, {
      ok: true,
      order_id: orderId,
      payment_status: mp.status,
      signature_validation: webhookSecret ? "validated" : "skipped_missing_secret",
    });
  } catch (e) {
    return json(500, { error: "internal_error", message: e instanceof Error ? e.message : "unknown" });
  }
});
