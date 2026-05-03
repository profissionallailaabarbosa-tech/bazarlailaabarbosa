/* global process */

import { createClient } from "@supabase/supabase-js";

const LOOKBACK_HOURS = 12;
const MAX_ORDERS_PER_RUN = 20;
const BATCH_SIZE = 5;
const FINAL_PAYMENT_STATUSES = new Set([
  "approved",
  "rejected",
  "cancelled",
  "charged_back",
  "refunded",
  "payment_link_error",
]);
const FINAL_ORDER_STATUSES = new Set(["falha ao iniciar pagamento"]);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function normalizeValue(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function buildPaymentStatusUrl(supabaseUrl) {
  const projectUrl = String(supabaseUrl || "").trim().replace(/\/+$/, "");
  return `${projectUrl}/functions/v1/payment-status`;
}

async function callPaymentStatus(paymentStatusUrl, order) {
  const response = await fetch(paymentStatusUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      order_id: Number(order.id),
      customer_phone: order.customer_phone || "",
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `payment_status_failed:${response.status}`);
  }

  return data;
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!cronSecret) {
    return json(500, { ok: false, error: "missing_cron_secret" });
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: "missing_supabase_env" });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    const paymentStatusUrl = buildPaymentStatusUrl(supabaseUrl);
    const cutoffIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

    const { data: recentOrders, error } = await supabase
      .from("orders")
      .select("id, customer_phone, payment_status, status, created_at")
      .gte("created_at", cutoffIso)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    const pendingOrders = (recentOrders || [])
      .filter((order) => {
        const paymentStatus = normalizeValue(order?.payment_status);
        const orderStatus = normalizeValue(order?.status);

        if (FINAL_PAYMENT_STATUSES.has(paymentStatus)) return false;
        if (FINAL_ORDER_STATUSES.has(orderStatus)) return false;
        return true;
      })
      .slice(0, MAX_ORDERS_PER_RUN);

    if (!pendingOrders.length) {
      return json(200, {
        ok: true,
        reviewed: 0,
        approved: 0,
        awaiting_confirmation: 0,
        without_payment: 0,
        failed: 0,
        message: "Nenhum pedido pendente recente para revisar.",
      });
    }

    const settledResults = [];

    for (const batch of chunkArray(pendingOrders, BATCH_SIZE)) {
      const batchResults = await Promise.allSettled(
        batch.map(async (order) => ({
          orderId: order.id,
          result: await callPaymentStatus(paymentStatusUrl, order),
        }))
      );
      settledResults.push(...batchResults);
    }

    let approved = 0;
    let awaitingConfirmation = 0;
    let withoutPayment = 0;
    let failed = 0;
    const failedOrders = [];

    settledResults.forEach((result) => {
      if (result.status !== "fulfilled") {
        failed += 1;
        return;
      }

      const orderData = result.value?.result?.order;
      const paymentStatus = normalizeValue(orderData?.payment_status);

      if (paymentStatus === "approved") {
        approved += 1;
        return;
      }

      if (result.value?.result?.found_payment) {
        awaitingConfirmation += 1;
        return;
      }

      withoutPayment += 1;
    });

    settledResults.forEach((result, index) => {
      if (result.status === "fulfilled") return;
      const failedOrderId = pendingOrders[index]?.id;
      if (failedOrderId) failedOrders.push(failedOrderId);
    });

    return json(200, {
      ok: true,
      reviewed: pendingOrders.length,
      approved,
      awaiting_confirmation: awaitingConfirmation,
      without_payment: withoutPayment,
      failed,
      failed_order_ids: failedOrders.slice(0, 10),
      message: "Revisão automática de pagamentos concluída.",
    });
  } catch (error) {
    return json(500, {
      ok: false,
      error: "sync_failed",
      message: error instanceof Error ? error.message : "unknown",
    });
  }
}
