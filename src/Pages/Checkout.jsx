import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, CreditCard, Loader2, ShoppingBag, Smartphone, User } from "lucide-react";
import { supabase } from "../api/supabase";
import { buildWhatsAppLink, resolveWhatsAppBase } from "../utils/whatsapp";

const PENDING_PAYMENT_STORAGE_KEY = "pending_checkout_order";
const DELIVERY_CONTACT_VALUE = "A combinar no WhatsApp";

const digitsOnly = (value) => String(value || "").replace(/\D/g, "");

const buildCheckoutSignature = ({ customerPhone, paymentMethod, deliveryMethod, totalAmount, items }) =>
  JSON.stringify({
    customerPhone: digitsOnly(customerPhone),
    paymentMethod: String(paymentMethod || ""),
    deliveryMethod: String(deliveryMethod || ""),
    totalAmount: Number(totalAmount || 0).toFixed(2),
    items: (items || []).map((item) => ({
      id: item.id,
      qty: Number(item.quantitySelected || item.quantity || 1),
      price: Number(item.price || 0),
    })),
  });

const formatPhoneDisplay = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  return digits;
};

const formatOrderItemLine = (item) => {
  const quantity = item.quantitySelected || item.quantity || 1;
  const size = item.size ? ` | Tam: ${item.size}` : "";
  const category = item.category ? ` | ${String(item.category).replace(/^./, (char) => char.toUpperCase())}` : "";
  return `${quantity}x ${item.name || "Produto"}${size}${category}`;
};

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [mpReturnHandled, setMpReturnHandled] = useState(false);
  const [mpReturnState, setMpReturnState] = useState(null);
  const [approvedRedirectCountdown, setApprovedRedirectCountdown] = useState(4);
  const [paymentReturnRefreshKey, setPaymentReturnRefreshKey] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    payment_method: "pix",
  });

  useEffect(() => {
    try {
      const checkoutDataRaw = localStorage.getItem("checkout_data");
      const checkoutData = checkoutDataRaw ? JSON.parse(checkoutDataRaw) : null;
      const savedCart = checkoutData?.items
        ? JSON.stringify(checkoutData.items)
        : localStorage.getItem("carrinho_laila") || localStorage.getItem("cart");

      if (savedCart) setCart(JSON.parse(savedCart));

      supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setConfig(data);
        });
    } catch (error) {
      console.error("Erro ao carregar checkout", error);
    }
  }, []);

  useEffect(() => {
    if (!config || mpReturnHandled) return;

    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    const orderId = params.get("order");
    if (!payment || !orderId) return;

    const whatsappSource = config?.whatsapp_number || config?.whatsapp || "";
    const pendingPaymentRaw = localStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
    const pendingPayment = pendingPaymentRaw ? JSON.parse(pendingPaymentRaw) : null;
    const pendingPhone = digitsOnly(pendingPayment?.customer_phone || "");
    let cancelled = false;

    const clearPendingPaymentStateLocal = () => {
      localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
      localStorage.removeItem("carrinho_laila");
      localStorage.removeItem("cart");
      localStorage.removeItem("checkout_data");
      window.dispatchEvent(new Event("cart-updated"));
    };

    const syncOrderWithProvider = async () => {
      const payload = { order_id: Number(orderId) };
      if (pendingPhone) {
        payload.customer_phone = pendingPhone;
      }

      try {
        const { data, error } = await supabase.functions.invoke("payment-status", {
          body: payload,
        });
        if (error) throw error;
        return data?.order || null;
      } catch {
        return null;
      }
    };

    const isApproved = (orderData) => {
      const paymentStatus = String(orderData?.payment_status || "").toLowerCase();
      const orderStatus = String(orderData?.status || "").toLowerCase();
      return paymentStatus === "approved" || orderStatus === "pago";
    };

    const isRejected = (orderData) =>
      ["rejected", "cancelled", "charged_back"].includes(String(orderData?.payment_status || "").toLowerCase());

    const buildItemsSummary = (items = []) =>
      (items || [])
        .slice(0, 4)
        .map((item) => formatOrderItemLine(item))
        .join(", ");

    const buildOrderWhatsAppUrl = (orderData, statusMessage) => {
      const customerName = orderData?.customer_name ? ` Cliente: ${orderData.customer_name}.` : "";
      const itemsSummary = buildItemsSummary(orderData?.items);
      const pieces = itemsSummary ? ` Peças: ${itemsSummary}.` : "";
      const deliveryMethod = orderData?.delivery_method
        ? ` Entrega: ${String(orderData.delivery_method).replace("_", " ")}.`
        : ` Entrega: ${DELIVERY_CONTACT_VALUE}.`;
      const totalAmount = Number(orderData?.total_amount || 0);
      const total = totalAmount > 0 ? ` Total: R$ ${totalAmount.toFixed(2)}.` : "";

      return buildWhatsAppLink(
        whatsappSource,
        `Oi! Pedido #${orderId}. ${statusMessage}.${customerName}${pieces}${deliveryMethod}${total}`
      );
    };

    const syncPaymentReturn = async () => {
      setMpReturnState({
        orderId,
        stage: "checking",
        message: "Estamos confirmando seu pagamento. Isso pode levar alguns segundos no PIX.",
      });

      const maxAttempts = payment === "pending" ? 14 : payment === "failure" ? 12 : 8;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const orderData = await syncOrderWithProvider();
        if (cancelled) return;

        if (isApproved(orderData)) {
          clearPendingPaymentStateLocal();
          setMpReturnState({
            orderId,
            stage: "approved",
            message: "Pagamento confirmado com sucesso. Seu pedido já foi registrado e o próximo passo é alinhar entrega e endereço no WhatsApp.",
            continueUrl: buildOrderWhatsAppUrl(orderData, "pagamento aprovado"),
            orderData,
          });
          return;
        }

        if (isRejected(orderData)) {
          setMpReturnState({
            orderId,
            stage: "failure",
            message: "Ainda não encontramos a confirmação do pagamento. Se você já pagou, aguarde mais um pouco e verifique novamente antes de refazer o pedido.",
            continueUrl: buildOrderWhatsAppUrl(orderData, "quero confirmar o status do meu pagamento"),
          });
          return;
        }

        setMpReturnState({
          orderId,
          stage: "checking",
          message:
            attempt >= 3
              ? "Seu pedido chegou. Estamos aguardando a confirmação final do pagamento."
              : "Estamos confirmando seu pagamento. Isso pode levar alguns segundos no PIX.",
        });
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      const orderData = await syncOrderWithProvider();
      if (cancelled) return;

      if (isApproved(orderData)) {
        clearPendingPaymentStateLocal();
        setMpReturnState({
          orderId,
          stage: "approved",
          message: "Pagamento confirmado com sucesso. Seu pedido já foi registrado e o próximo passo é alinhar entrega e endereço no WhatsApp.",
          continueUrl: buildOrderWhatsAppUrl(orderData, "pagamento aprovado"),
          orderData,
        });
        return;
      }

      setMpReturnState({
        orderId,
        stage: "pending",
        message:
          "Seu pedido foi recebido. O PIX ainda está sincronizando. Aguarde alguns segundos e verifique novamente. Não refaça o pedido até confirmar este status.",
        continueUrl: buildOrderWhatsAppUrl(orderData, "estou aguardando a confirmação do pagamento"),
      });
    };

    syncPaymentReturn();
    return () => {
      cancelled = true;
    };
  }, [config, mpReturnHandled, paymentReturnRefreshKey]);

  const clearPendingPaymentState = () => {
    localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
    localStorage.removeItem("checkout_data");
    window.dispatchEvent(new Event("cart-updated"));
  };

  const redirectToExternal = (url, options = {}) => {
    if (!url) return;
    const { replace = false, handled = false } = options;
    if (handled) setMpReturnHandled(true);
    if (replace) {
      window.location.replace(url);
      return;
    }
    window.location.href = url;
  };

  const refreshPaymentStatus = () => {
    setMpReturnHandled(false);
    setPaymentReturnRefreshKey((current) => current + 1);
  };

  const exitPaymentValidation = (destination = "/cart") => {
    clearPendingPaymentState();
    setMpReturnHandled(true);
    setMpReturnState(null);
    navigate(destination, { replace: true });
  };

  useEffect(() => {
    if (mpReturnState?.stage !== "approved" || !mpReturnState?.continueUrl) {
      setApprovedRedirectCountdown(4);
      return;
    }

    const intervalId = window.setInterval(() => {
      setApprovedRedirectCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          redirectToExternal(mpReturnState.continueUrl, { replace: true, handled: true });
          return 0;
        }
        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [mpReturnState]);

  useEffect(() => {
    if (!config) return;
    const paymentMethods = [];
    if (config.enable_pix) paymentMethods.push("pix");
    if (config.enable_credit_card) paymentMethods.push("card");

    setFormData((prev) => {
      if (paymentMethods.length === 0 || paymentMethods.includes(prev.payment_method)) return prev;
      return { ...prev, payment_method: paymentMethods[0] };
    });
  }, [config]);

  const subtotal = cart.reduce(
    (acc, item) => acc + Number(item.price || 0) * Number(item.quantitySelected || item.quantity || 1),
    0
  );
  const total = subtotal;

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  const whatsappBase = resolveWhatsAppBase(config?.whatsapp_number || config?.whatsapp);
  const isPaymentMethodAvailable = (method) =>
    method === "pix" ? !!config?.enable_pix : method === "card" ? !!config?.enable_credit_card : false;

  const getCustomerError = () =>
    !formData.name?.trim()
      ? "Informe o nome completo."
      : digitsOnly(formData.phone).length < 10
        ? "Informe um WhatsApp válido com DDD."
        : !isValidEmail(formData.email)
          ? "Informe um e-mail válido."
          : null;

  const getFinalizeError = () =>
    getCustomerError() ||
    (!isPaymentMethodAvailable(formData.payment_method)
      ? "Selecione uma forma de pagamento disponível antes de continuar."
      : !whatsappBase
        ? "Configure o WhatsApp da loja antes de finalizar pedidos."
        : null);

  const handleFinalize = async () => {
    const finalizeError = getFinalizeError();
    if (finalizeError) {
      alert(finalizeError);
      return;
    }

    setLoading(true);

    try {
      const normalizedPhone = digitsOnly(formData.phone);
      const orderNotes = `E-mail: ${formData.email}\nEntrega e endereço combinados pelo WhatsApp.`;
      const checkoutSignature = buildCheckoutSignature({
        customerPhone: normalizedPhone,
        paymentMethod: formData.payment_method,
        deliveryMethod: DELIVERY_CONTACT_VALUE,
        totalAmount: total,
        items: cart,
      });
      const pendingPaymentRaw = localStorage.getItem(PENDING_PAYMENT_STORAGE_KEY);
      const pendingPayment = pendingPaymentRaw ? JSON.parse(pendingPaymentRaw) : null;
      const canReusePendingOrder =
        pendingPayment?.order_id &&
        pendingPayment?.checkout_signature === checkoutSignature &&
        Date.now() - new Date(pendingPayment.created_at).getTime() < 1000 * 60 * 30;

      let order = canReusePendingOrder ? { id: pendingPayment.order_id } : null;
      if (!canReusePendingOrder) {
        const { data, error } = await supabase.rpc("create_order_with_stock", {
          p_customer_name: formData.name,
          p_customer_phone: normalizedPhone,
          p_address: orderNotes,
          p_total_amount: total,
          p_payment_method: formData.payment_method,
          p_delivery_method: DELIVERY_CONTACT_VALUE,
          p_status: "Aguardando Pagamento",
          p_items: cart,
        });
        if (error) throw error;
        order = data;
      }

      const itemsList = cart.map((item) => `- ${formatOrderItemLine(item)}`).join("\n");
      const textoPagamento = formData.payment_method === "pix" ? "PIX" : "Cartão de Crédito";
      const msg = `*NOVO PEDIDO #${order?.id}*\n\n*Cliente:* ${formData.name}\n*WhatsApp:* ${normalizedPhone}\n*E-mail:* ${formData.email}\n*Pagamento:* ${textoPagamento}\n*Entrega:* ${DELIVERY_CONTACT_VALUE}\n\n*Itens:*\n${itemsList}\n\n*Total das peças:* R$ ${total.toFixed(2)}`;

      if (formData.payment_method === "card" || formData.payment_method === "pix") {
        const origin = window.location.origin;
        const paymentItems = cart.map((item) => ({
          id: item.id,
          title: item.name || "Produto",
          quantity: Number(item.quantitySelected || item.quantity || 1),
          unit_price: Number(item.price || 0),
        }));

        let paymentData;
        try {
          localStorage.setItem(
            PENDING_PAYMENT_STORAGE_KEY,
            JSON.stringify({
              order_id: order?.id,
              created_at: new Date().toISOString(),
              customer_name: formData.name,
              customer_phone: normalizedPhone,
              payment_method: formData.payment_method,
              delivery_method: DELIVERY_CONTACT_VALUE,
              total_amount: total,
              items: cart,
              checkout_signature: checkoutSignature,
            })
          );

          const { data, error: paymentError } = await supabase.functions.invoke("create-payment", {
            body: {
              order_id: order?.id,
              external_reference: String(order?.id),
              payer_email: formData.email || undefined,
              items: paymentItems,
              success_url: `${origin}/checkout?payment=success&order=${order?.id}`,
              pending_url: `${origin}/checkout?payment=pending&order=${order?.id}`,
              failure_url: `${origin}/checkout?payment=failure&order=${order?.id}`,
            },
          });

          if (paymentError) throw paymentError;
          paymentData = data;
        } catch (paymentErr) {
          await supabase
            .from("orders")
            .update({ status: "Falha ao iniciar pagamento", payment_status: "payment_link_error" })
            .eq("id", order?.id);
          throw paymentErr;
        }

        const paymentUrl = paymentData?.init_point || paymentData?.sandbox_init_point;
        if (!paymentUrl) throw new Error("Não foi possível gerar link de pagamento.");
        redirectToExternal(paymentUrl, { replace: true });
        return;
      }

      const whatsappSource = config?.whatsapp_number || config?.whatsapp;
      const whatsappUrl = buildWhatsAppLink(whatsappSource, msg);
      if (!whatsappUrl) {
        throw new Error("WhatsApp da loja não configurado. Ajuste isso no painel admin antes de continuar.");
      }

      localStorage.removeItem("carrinho_laila");
      localStorage.removeItem("cart");
      localStorage.removeItem("checkout_data");
      window.dispatchEvent(new Event("cart-updated"));
      redirectToExternal(whatsappUrl, { replace: true });
    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao processar pedido. Tente novamente.");
      setLoading(false);
    }
  };

  if (mpReturnState) {
    return (
      <div className="min-h-screen bg-rose-50/30 px-3 py-8 font-sans text-gray-700 sm:px-4">
        <div className="mx-auto max-w-[28rem] sm:max-w-xl">
          <div className="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
            <div
              className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                mpReturnState.stage === "approved"
                  ? "bg-green-100 text-green-600"
                  : mpReturnState.stage === "failure"
                    ? "bg-red-100 text-red-600"
                    : "bg-blue-100 text-blue-600"
              }`}
            >
              {mpReturnState.stage === "approved" ? (
                <Check size={30} />
              ) : mpReturnState.stage === "failure" ? (
                <Clock size={30} />
              ) : (
                <Loader2 className="animate-spin" size={30} />
              )}
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-800">
              {mpReturnState.stage === "approved" ? "Pedido confirmado" : `Pedido #${mpReturnState.orderId}`}
            </h1>
            <p className="mb-6 text-sm text-gray-500">{mpReturnState.message}</p>

            {mpReturnState.stage === "approved" && mpReturnState.orderData && (
              <div className="mb-6 rounded-2xl border border-green-100 bg-green-50/60 p-4 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-green-700">Resumo do pedido</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p><b>Número:</b> #{mpReturnState.orderData.id}</p>
                  <p><b>Status:</b> Pagamento aprovado</p>
                  <p><b>Próximo passo:</b> Vamos te levar para o WhatsApp da loja para alinhar entrega e endereço.</p>
                  {mpReturnState.orderData.customer_name && <p><b>Cliente:</b> {mpReturnState.orderData.customer_name}</p>}
                  <p><b>Entrega:</b> {String(mpReturnState.orderData.delivery_method || DELIVERY_CONTACT_VALUE).replace("_", " ")}</p>
                  <p><b>Total:</b> R$ {Number(mpReturnState.orderData.total_amount || 0).toFixed(2)}</p>
                  {!!mpReturnState.orderData.items?.length && (
                    <div>
                      <p><b>Peças:</b></p>
                      <ul className="mt-1 space-y-1 text-gray-600">
                        {mpReturnState.orderData.items.slice(0, 4).map((item, index) => (
                          <li key={`${item.id || item.name}-${index}`}>
                            • {item.quantitySelected || item.quantity || 1}x {item.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mpReturnState.stage === "checking" && (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">Não feche esta página enquanto confirmamos seu pagamento.</p>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
                  Se você pagou pelo app do seu banco e voltou agora, pode ficar tranquila: estamos tentando reencontrar o pagamento e concluir o pedido sem você precisar refazer a compra.
                </div>
                <button
                  onClick={refreshPaymentStatus}
                  className="w-full rounded-xl bg-rose-500 py-3 font-bold text-white transition hover:bg-rose-600"
                >
                  Já paguei, verificar agora
                </button>
                <button
                  onClick={() => exitPaymentValidation("/cart")}
                  className="w-full rounded-xl border border-gray-300 py-3 font-bold text-gray-700 transition hover:bg-gray-50"
                >
                  Não paguei, voltar para a sacola
                </button>
              </div>
            )}

            {mpReturnState.stage === "approved" && mpReturnState.continueUrl && (
              <p className="mb-4 text-xs text-green-700">
                Você será redirecionada automaticamente para o WhatsApp em {approvedRedirectCountdown}s para combinar a entrega.
              </p>
            )}

            {mpReturnState.stage === "pending" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                  Isso costuma acontecer quando o PIX foi pago em outro banco e a confirmação ainda está chegando na loja. Aguarde alguns segundos e toque em verificar novamente.
                </div>
                <button onClick={refreshPaymentStatus} className="w-full rounded-xl bg-rose-500 py-3 font-bold text-white transition hover:bg-rose-600">
                  Verificar novamente
                </button>
                {mpReturnState.continueUrl && (
                  <button
                    onClick={() => redirectToExternal(mpReturnState.continueUrl, { replace: true, handled: true })}
                    className="w-full rounded-xl border border-gray-300 py-3 font-bold text-gray-700 transition hover:bg-gray-50"
                  >
                    Falar com a loja no WhatsApp
                  </button>
                )}
                <button onClick={() => exitPaymentValidation("/cart")} className="w-full rounded-xl border border-gray-300 py-3 font-bold text-gray-700 transition hover:bg-gray-50">
                  Voltar para a sacola
                </button>
              </div>
            )}

            {(mpReturnState.stage === "approved" || mpReturnState.stage === "failure") && (
              <div className="space-y-3">
                {mpReturnState.continueUrl && (
                  <button
                    onClick={() => redirectToExternal(mpReturnState.continueUrl, { replace: true, handled: true })}
                    className={`w-full rounded-xl py-3 font-bold transition ${
                      mpReturnState.stage === "approved"
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {mpReturnState.stage === "approved" ? "Ir para o WhatsApp" : "Falar com a loja"}
                  </button>
                )}
                {mpReturnState.stage === "failure" && (
                  <button onClick={refreshPaymentStatus} className="w-full rounded-xl bg-rose-500 py-3 font-bold text-white transition hover:bg-rose-600">
                    Verificar novamente
                  </button>
                )}
                {mpReturnState.stage === "failure" && (
                  <button onClick={() => exitPaymentValidation("/cart")} className="w-full rounded-xl border border-gray-300 py-3 font-bold text-gray-700 transition hover:bg-gray-50">
                    Voltar para a sacola
                  </button>
                )}
                {mpReturnState.stage === "approved" && (
                  <button onClick={() => navigate("/")} className="w-full rounded-xl border border-gray-300 py-3 font-bold text-gray-700 transition hover:bg-gray-50">
                    Voltar para a loja
                  </button>
                )}
              </div>
            )}

            {mpReturnState.stage !== "checking" && (
              <div className="mt-4 text-xs text-gray-400">O status mostrado aqui é conferido antes de liberar o próximo passo.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-gray-50">
        <ShoppingBag size={64} className="mb-4 text-gray-300" />
        <p className="text-lg text-gray-500">Seu carrinho está vazio.</p>
        <button onClick={() => navigate("/")} className="mt-4 font-bold text-rose-500 hover:underline">
          Voltar para a Loja
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rose-50/30 px-3 py-8 font-sans text-gray-700 sm:px-4">
      <div className="mx-auto max-w-[28rem] sm:max-w-5xl">
        <h1 className="mb-8 text-center text-2xl font-bold text-gray-800">Finalizar Compra</h1>

        <div className="mb-8 overflow-x-auto pb-1">
          <div className="mx-auto flex min-w-max items-center justify-center gap-2 px-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${currentStep >= step ? "bg-rose-500 text-white shadow-lg shadow-rose-200" : "bg-gray-200 text-gray-500"}`}>
                  {currentStep > step ? <Check size={14} /> : step}
                </div>
                {step < 3 && <div className={`mx-1 h-1 w-8 ${currentStep > step ? "bg-rose-500" : "bg-gray-200"}`}></div>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {currentStep === 1 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
                  <User className="text-rose-500" size={20} /> Seus Dados
                </h2>
                <div className="mb-6 grid gap-3 md:grid-cols-2">
                  <input
                    placeholder="Nome completo *"
                    className="rounded-xl border p-3 text-base outline-none transition focus:border-rose-500 sm:text-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <input
                    placeholder="WhatsApp com DDD *"
                    inputMode="numeric"
                    className="rounded-xl border p-3 text-base outline-none transition focus:border-rose-500 sm:text-sm"
                    value={formatPhoneDisplay(formData.phone)}
                    onChange={(e) => setFormData({ ...formData, phone: digitsOnly(e.target.value).slice(0, 11) })}
                  />
                  <input
                    placeholder="E-mail *"
                    className="rounded-xl border p-3 text-base outline-none transition focus:border-rose-500 sm:text-sm md:col-span-2"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs leading-relaxed text-emerald-800">
                  <p className="font-bold uppercase tracking-[0.18em] text-emerald-700">Obrigatório preencher</p>
                  <p className="mt-1">Nome, WhatsApp e e-mail são obrigatórios para identificar seu pedido e confirmar o pagamento.</p>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
                  Endereço, correio, retirada ou entrega serão combinados direto no WhatsApp da loja depois que o pagamento for confirmado.
                </div>
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      const err = getCustomerError();
                      if (err) {
                        alert(err);
                        return;
                      }
                      setCurrentStep(2);
                    }}
                    className="rounded-xl bg-rose-500 px-8 py-3 font-bold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-600"
                  >
                    Continuar para Pagamento
                  </button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
                  <CreditCard className="text-rose-500" size={20} /> Pagamento
                </h2>
                <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-relaxed text-gray-600">
                  O valor deste checkout é das peças. Frete, correio, retirada ou entrega ficam combinados depois com a loja no WhatsApp.
                </div>
                <div className="space-y-3">
                  {config?.enable_pix && (
                    <div
                      onClick={() => setFormData({ ...formData, payment_method: "pix" })}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 p-4 transition-all ${formData.payment_method === "pix" ? "border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}
                    >
                      <div className="flex items-center gap-3">
                        <Smartphone className={formData.payment_method === "pix" ? "text-rose-500" : "text-gray-400"} />
                        <div>
                          <span className="block font-bold text-gray-700">PIX</span>
                          <span className="text-xs text-gray-500">Mais rápido para confirmar e seguir para o WhatsApp.</span>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">Mais usado</span>
                    </div>
                  )}
                  {config?.enable_credit_card && (
                    <div
                      onClick={() => setFormData({ ...formData, payment_method: "card" })}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-all ${formData.payment_method === "card" ? "border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}
                    >
                      <CreditCard className={formData.payment_method === "card" ? "text-rose-500" : "text-gray-400"} />
                      <div>
                        <span className="block font-bold text-gray-700">Cartão de Crédito</span>
                        <span className="text-xs text-gray-500">Pagamento protegido pelo checkout do Mercado Pago.</span>
                      </div>
                    </div>
                  )}
                </div>
                {formData.payment_method === "pix" && (
                  <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                    Se você for pagar pelo app do seu banco, volte para esta mesma aba depois do pagamento. A loja vai tentar reencontrar e validar seu PIX automaticamente.
                  </div>
                )}
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                  <button onClick={() => setCurrentStep(1)} className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-600 transition hover:bg-gray-50">
                    Voltar
                  </button>
                  <button
                    onClick={() => {
                      if (!isPaymentMethodAvailable(formData.payment_method)) {
                        alert("Selecione uma forma de pagamento disponível para continuar.");
                        return;
                      }
                      setCurrentStep(3);
                    }}
                    className="flex-1 rounded-xl bg-rose-500 px-4 py-3 font-bold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-600"
                  >
                    Revisar Pedido
                  </button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-800">
                  <Check className="text-rose-500" size={20} /> Revisão Final
                </h2>
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
                  <h3 className="mb-2 flex items-center justify-center gap-2 font-bold text-blue-800">
                    <CreditCard size={18} /> Pagamento Seguro
                  </h3>
                  <p className="mb-3 text-center text-xs text-blue-700">
                    Ao clicar em <b>"Confirmar e Enviar Pedido"</b>, você será redirecionada para o checkout protegido do Mercado Pago.
                  </p>
                  <p className="mb-4 text-center text-[11px] text-gray-500">
                    O valor deste checkout é das peças. Depois da aprovação, a loja segue com você no WhatsApp para combinar entrega, retirada ou envio pelos Correios.
                  </p>
                  <div className="grid gap-2 text-[11px] text-blue-900 sm:grid-cols-3">
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">Seu pedido já fica registrado antes do pagamento.</div>
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">A confirmação é conferida antes de liberar o próximo passo.</div>
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">Depois da aprovação, seguimos pelo WhatsApp para alinhar a entrega.</div>
                  </div>
                  {formData.payment_method === "pix" && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
                      Pagando pelo app do banco? Depois do PIX, volte para esta aba da loja para ela confirmar seu pedido e te levar para o WhatsApp.
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-3 border-t pt-4 text-sm text-gray-600">
                  <p><b>Nome:</b> {formData.name}</p>
                  <p><b>WhatsApp:</b> {formatPhoneDisplay(formData.phone)}</p>
                  <p><b>E-mail:</b> {formData.email}</p>
                  <p><b>Entrega:</b> {DELIVERY_CONTACT_VALUE}</p>
                  <p><b>Pagamento:</b> {formData.payment_method === "pix" ? "PIX" : "Cartão de crédito"}</p>
                  <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                    Confira seus dados antes de finalizar. Isso ajuda a loja a confirmar o pagamento e continuar o atendimento sem erro.
                  </div>
                </div>
                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
                  <button onClick={() => setCurrentStep(2)} className="flex-1 rounded-xl border border-gray-300 px-4 py-3 font-bold text-gray-600 transition hover:bg-gray-50">
                    Voltar
                  </button>
                  <button
                    onClick={handleFinalize}
                    disabled={loading}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-bold text-white shadow-lg transition hover:bg-green-700"
                  >
                    {loading ? "Processando..." : "Confirmar e Enviar Pedido"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="h-fit space-y-4">
            <div className="sticky top-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 font-bold text-gray-800">
                <ShoppingBag size={18} /> Seu Pedido
              </h3>
              <div className="custom-scrollbar max-h-[300px] space-y-3 overflow-y-auto pr-2">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex gap-3 border-b border-gray-100 pb-3 text-sm last:border-0">
                    {item.image && <img src={item.image} className="h-12 w-12 rounded bg-gray-100 object-cover" />}
                    <div className="flex-1">
                      <p className="font-bold text-gray-700">{item.name}</p>
                      <p className="text-xs text-gray-500">Qtd: {item.quantitySelected || item.quantity || 1}</p>
                    </div>
                    <span className="font-bold text-gray-700">
                      R$ {(Number(item.price || 0) * Number(item.quantitySelected || item.quantity || 1)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mb-4 rounded-xl border border-rose-100 bg-[#fff7f4] px-4 py-3">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.2em] text-rose-400">Compra com segurança</p>
                <p className="text-xs text-gray-600">
                  Estoque validado no pedido, pagamento via Mercado Pago, confirmação antes do redirecionamento e contato direto com a loja depois para alinhar a entrega.
                </p>
              </div>
              <div className="space-y-2 border-t pt-4">
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Entrega / frete</span>
                  <span className="font-semibold text-amber-600">A combinar</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-xl font-bold text-rose-500">
                  <span>Total agora</span>
                  <span>R$ {total.toFixed(2)}</span>
                </div>
                <p className="pt-1 text-[11px] leading-relaxed text-gray-400">
                  O valor acima é das peças. Frete, Correios, retirada ou entrega ficam alinhados depois no WhatsApp da loja.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
