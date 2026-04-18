import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Clock, CreditCard, Loader2, MapPin, ShoppingBag, Smartphone, Truck, User } from "lucide-react";
import { supabase } from "../api/supabase";
import { buildWhatsAppLink } from "../utils/whatsapp";

const PENDING_PAYMENT_STORAGE_KEY = "pending_checkout_order";
const digitsOnly = (value) => String(value || "").replace(/\D/g, "");
const formatPhoneDisplay = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  return digits;
};
const formatCpfDisplay = (value) => {
  const digits = digitsOnly(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [config, setConfig] = useState(null);
  const [cartShippingQuote, setCartShippingQuote] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingCEP, setIsLoadingCEP] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [mpReturnHandled, setMpReturnHandled] = useState(false);
  const [mpReturnState, setMpReturnState] = useState(null);
  const [approvedRedirectCountdown, setApprovedRedirectCountdown] = useState(4);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    address: { cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "" },
    payment_method: "pix",
    delivery_method: "retirada",
  });

  useEffect(() => {
    try {
      const checkoutDataRaw = localStorage.getItem("checkout_data");
      const checkoutData = checkoutDataRaw ?JSON.parse(checkoutDataRaw) : null;
      const savedCart = checkoutData?.items
        ?JSON.stringify(checkoutData.items)
        : localStorage.getItem("carrinho_laila") || localStorage.getItem("cart");
      if (savedCart) setCart(JSON.parse(savedCart));

      if (checkoutData?.shipping && checkoutData?.address?.cep) {
        setCartShippingQuote({ ...checkoutData.shipping, cep: String(checkoutData.address.cep).replace(/\D/g, "") });
      }

      if (checkoutData?.address) {
        setFormData((prev) => ({
          ...prev,
          address: {
            ...prev.address,
            cep: checkoutData.address.cep || "",
            street: checkoutData.address.logradouro || checkoutData.address.street || "",
            number: checkoutData.address.number || "",
            complement: checkoutData.address.complemento || checkoutData.address.complement || "",
            neighborhood: checkoutData.address.bairro || checkoutData.address.neighborhood || "",
            city: checkoutData.address.localidade || checkoutData.address.city || "",
            state: checkoutData.address.uf || checkoutData.address.state || "",
          },
          delivery_method: checkoutData.shipping ?"correios" : prev.delivery_method,
        }));
      }

      supabase.from("settings").select("*").eq("id", 1).maybeSingle().then(({ data }) => {
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
    const pendingPayment = pendingPaymentRaw ?JSON.parse(pendingPaymentRaw) : null;
    const pendingPhone = digitsOnly(pendingPayment?.customer_phone || "");
    let cancelled = false;

    const clearPendingPaymentState = () => {
      localStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
      localStorage.removeItem("carrinho_laila");
      localStorage.removeItem("cart");
      localStorage.removeItem("checkout_data");
      window.dispatchEvent(new Event("cart-updated"));
    };

    const syncOrderWithProvider = async () => {
      if (!pendingPhone) return null;
      try {
        const { data, error } = await supabase.functions.invoke("payment-status", {
          body: { order_id: Number(orderId), customer_phone: pendingPhone },
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

    const isRejected = (orderData) => ["rejected", "cancelled", "charged_back"].includes(String(orderData?.payment_status || "").toLowerCase());

    const buildItemsSummary = (items = []) =>
      (items || [])
        .slice(0, 4)
        .map((item) => `${item.quantitySelected || item.quantity || 1}x ${item.name}`)
        .join(", ");

    const buildOrderWhatsAppUrl = (orderData, statusMessage) => {
        const customerName = orderData?.customer_name ?` Cliente: ${orderData.customer_name}.` : "";
        const itemsSummary = buildItemsSummary(orderData?.items);
        const pieces = itemsSummary ?` Peças: ${itemsSummary}.` : "";
        const deliveryMethod = orderData?.delivery_method ?` Entrega: ${String(orderData.delivery_method).replace("_", " ")}.` : "";
      const totalAmount = Number(orderData?.total_amount || 0);
      const total = totalAmount > 0 ?` Total: R$ ${totalAmount.toFixed(2)}.` : "";
      return buildWhatsAppLink(
        whatsappSource,
        `Oi! Pedido #${orderId}. ${statusMessage}.${customerName}${pieces}${deliveryMethod}${total}`
      );
    };

    const syncPaymentReturn = async () => {
      setMpReturnState({ orderId, stage: "checking", message: "Estamos confirmando seu pagamento. Isso pode levar alguns segundos no PIX." });

      const maxAttempts = payment === "pending" ? 14 : payment === "failure" ? 12 : 8;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const orderData = await syncOrderWithProvider();
        if (cancelled) return;
        if (isApproved(orderData)) {
          clearPendingPaymentState();
          setMpReturnState({
            orderId,
            stage: "approved",
            message: "Pagamento confirmado com sucesso. Seu pedido já foi registrado e separado para o próximo passo.",
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
        setMpReturnState({ orderId, stage: "checking", message: attempt >= 3 ?"Seu pedido chegou. Estamos aguardando a confirmação final do pagamento." : "Estamos confirmando seu pagamento. Isso pode levar alguns segundos no PIX." });
        await new Promise((resolve) => setTimeout(resolve, 2500));
      }

      const orderData = await syncOrderWithProvider();
      if (cancelled) return;
      if (isApproved(orderData)) {
        clearPendingPaymentState();
        setMpReturnState({
          orderId,
          stage: "approved",
          message: "Pagamento confirmado com sucesso. Seu pedido já foi registrado e separado para o próximo passo.",
          continueUrl: buildOrderWhatsAppUrl(orderData, "pagamento aprovado"),
          orderData,
        });
        return;
      }
      setMpReturnState({
        orderId,
        stage: "pending",
        message: "Seu pedido foi recebido. O PIX ainda está sincronizando. Aguarde alguns segundos e verifique novamente. Não refaça o pedido até confirmar este status.",
        continueUrl: buildOrderWhatsAppUrl(orderData, "estou aguardando a confirmação do pagamento"),
      });
    };

    syncPaymentReturn();
    return () => {
      cancelled = true;
    };
  }, [config, mpReturnHandled]);

  useEffect(() => {
    if (mpReturnState?.stage !== "approved" || !mpReturnState?.continueUrl) {
      setApprovedRedirectCountdown(4);
      return;
    }

    const intervalId = window.setInterval(() => {
      setApprovedRedirectCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId);
          setMpReturnHandled(true);
          window.location.href = mpReturnState.continueUrl;
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

  const searchCEP = async (cep) => {
    const cleanCEP = cep.replace(/\D/g, "");
    if (cleanCEP.length !== 8) return;
    setIsLoadingCEP(true);
    setCartShippingQuote((prev) => (prev?.cep === cleanCEP ?prev : null));
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData((prev) => ({ ...prev, address: { ...prev.address, cep: cleanCEP, street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" } }));
      } else {
        alert("CEP não encontrado.");
      }
    } catch {
      alert("Erro ao buscar CEP.");
    }
    setIsLoadingCEP(false);
  };

  const subtotal = cart.reduce((acc, item) => acc + parseFloat(item.price) * (item.quantitySelected || item.quantity || 1), 0);
  const currentCepDigits = (formData.address.cep || "").replace(/\D/g, "");
  const requiresAddress = formData.delivery_method !== "retirada";
  const shippingPrice = useMemo(() => {
    if (formData.delivery_method !== "correios" || !config?.enable_shipping_calc) return 0;
    if (cartShippingQuote && cartShippingQuote.cep === currentCepDigits) return parseFloat(cartShippingQuote.price) || 0;
    if (config?.shipping_origin_cep && formData.address.cep) {
      const originPrefix = config.shipping_origin_cep.substring(0, 1);
      const destPrefix = formData.address.cep.substring(0, 1);
      return originPrefix === destPrefix ?parseFloat(config.shipping_local_price) || 20 : parseFloat(config.shipping_national_price) || 40;
    }
    return parseFloat(config?.shipping_national_price) || 40;
  }, [formData.delivery_method, formData.address.cep, config, cartShippingQuote, currentCepDigits]);
  const total = subtotal + shippingPrice;

  const getPhoneDigits = (value) => digitsOnly(value);
  const getCpfDigits = (value) => digitsOnly(value);
  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
  const isDeliveryMethodAvailable = (method) => method === "correios" ?!!config?.enable_shipping_calc : method === "retirada" ?!!config?.enable_pickup : method === "uber" ?!!config?.enable_uber : false;
  const isPaymentMethodAvailable = (method) => method === "pix" ?!!config?.enable_pix : method === "card" ?!!config?.enable_credit_card : false;
  const getCustomerError = () =>
    !formData.name?.trim()
      ?"Informe o nome completo."
      : getPhoneDigits(formData.phone).length < 10
        ?"Informe um WhatsApp válido com DDD."
        : getCpfDigits(formData.cpf).length !== 11
          ?"Informe um CPF válido com 11 números."
          : !isValidEmail(formData.email)
            ?"Informe um e-mail válido."
            : null;
  const getAddressError = () => !requiresAddress ?null : !formData.address.cep?.trim() ?"Informe o CEP." : !formData.address.street?.trim() ?"Informe a rua." : !formData.address.number?.trim() ?"Informe o número." : !formData.address.neighborhood?.trim() ?"Informe o bairro." : !formData.address.city?.trim() ?"Informe a cidade." : !formData.address.state?.trim() ?"Informe o estado (UF)." : null;
  const getStep2Error = () => getCustomerError() || (!isDeliveryMethodAvailable(formData.delivery_method) ?"Selecione uma forma de entrega para continuar." : getAddressError());
  const getFinalizeError = () => getStep2Error() || (!isPaymentMethodAvailable(formData.payment_method) ?"Selecione uma forma de pagamento disponível antes de continuar." : !isDeliveryMethodAvailable(formData.delivery_method) ?"Selecione uma forma de entrega antes de continuar." : null);

  const handleFinalize = async () => {
    const finalizeError = getFinalizeError();
    if (finalizeError) {
      alert(finalizeError);
      return;
    }
    setLoading(true);
    try {
      const addressFull = formData.delivery_method === "retirada" ?"Retirada na Loja" : `${formData.address.street}, ${formData.address.number} - ${formData.address.neighborhood}, ${formData.address.city}/${formData.address.state} (CEP: ${formData.address.cep})`;
      const statusPagamentoBanco = formData.payment_method === "pix" || formData.payment_method === "card" ?"Aguardando Pagamento" : "Pendente";
      const normalizedPhone = getPhoneDigits(formData.phone);
      const normalizedCpf = getCpfDigits(formData.cpf);
      const { data: order, error } = await supabase.rpc("create_order_with_stock", { p_customer_name: formData.name, p_customer_phone: normalizedPhone, p_address: addressFull, p_total_amount: total, p_payment_method: formData.payment_method, p_delivery_method: formData.delivery_method, p_status: statusPagamentoBanco, p_items: cart });
      if (error) throw error;

      const itemsList = cart.map((item) => `- ${item.quantitySelected || item.quantity || 1}x ${item.name}`).join("\n");
      const textoPagamento = formData.payment_method === "pix" ?"PIX" : "Cartão de Crédito";
      const msg = `*NOVO PEDIDO #${order?.id}*\n\n*Cliente:* ${formData.name}\n*WhatsApp:* ${normalizedPhone}\n*CPF:* ${normalizedCpf}\n*E-mail:* ${formData.email}\n*Pagamento:* ${textoPagamento}\n*Entrega:* ${formData.delivery_method}\n\n*Itens:*\n${itemsList}\n\n*Total:* R$ ${total.toFixed(2)}`;

      if (formData.payment_method === "card" || formData.payment_method === "pix") {
        const origin = window.location.origin;
        const paymentItems = cart.map((item) => ({ id: item.id, title: item.name || "Produto", quantity: Number(item.quantitySelected || item.quantity || 1), unit_price: Number(item.price || 0) }));
        if (shippingPrice > 0) {
          paymentItems.push({
            id: "shipping",
            title:
              formData.delivery_method === "correios"
                ? "Entrega - Correios"
                : formData.delivery_method === "uber"
                  ? "Entrega - Uber/99"
                  : "Entrega",
            quantity: 1,
            unit_price: Number(shippingPrice),
          });
        }
        let paymentData;
        try {
          const { data, error: paymentError } = await supabase.functions.invoke("create-payment", { body: { order_id: order?.id, external_reference: String(order?.id), payer_email: formData.email || undefined, items: paymentItems, success_url: `${origin}/checkout?payment=success&order=${order?.id}`, pending_url: `${origin}/checkout?payment=pending&order=${order?.id}`, failure_url: `${origin}/checkout?payment=failure&order=${order?.id}` } });
          if (paymentError) throw paymentError;
          paymentData = data;
        } catch (paymentErr) {
          await supabase.from("orders").update({ status: "Falha ao iniciar pagamento", payment_status: "payment_link_error" }).eq("id", order?.id);
          throw paymentErr;
        }
        const paymentUrl = paymentData?.init_point || paymentData?.sandbox_init_point;
        if (!paymentUrl) throw new Error("Não foi possível gerar link de pagamento.");
        localStorage.setItem(PENDING_PAYMENT_STORAGE_KEY, JSON.stringify({
          order_id: order?.id,
          created_at: new Date().toISOString(),
          customer_name: formData.name,
          customer_phone: normalizedPhone,
          payment_method: formData.payment_method,
          delivery_method: formData.delivery_method,
          total_amount: total,
          items: cart,
        }));
        window.location.href = paymentUrl;
        return;
      }

      const whatsappSource = config?.whatsapp_number || config?.whatsapp;
      const whatsappUrl = buildWhatsAppLink(whatsappSource, msg);
      localStorage.removeItem("carrinho_laila");
      localStorage.removeItem("cart");
      localStorage.removeItem("checkout_data");
      window.dispatchEvent(new Event("cart-updated"));
      window.location.href = whatsappUrl;
    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao processar pedido. Tente novamente.");
      setLoading(false);
    }
  };

  if (mpReturnState) {
    return (
      <div className="min-h-screen bg-rose-50/30 py-8 px-4 font-sans text-gray-700">
        <div className="max-w-xl mx-auto">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${mpReturnState.stage === "approved" ?"bg-green-100 text-green-600" : mpReturnState.stage === "failure" ?"bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"}`}>
              {mpReturnState.stage === "approved" ?<Check size={30} /> : mpReturnState.stage === "failure" ?<Clock size={30} /> : <Loader2 className="animate-spin" size={30} />}
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">{mpReturnState.stage === "approved" ?"Pedido confirmado" : `Pedido #${mpReturnState.orderId}`}</h1>
            <p className="text-sm text-gray-500 mb-6">{mpReturnState.message}</p>
            {mpReturnState.stage === "approved" && mpReturnState.orderData && (
              <div className="mb-6 rounded-2xl border border-green-100 bg-green-50/60 p-4 text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-green-700">Resumo do pedido</p>
                <div className="mt-3 space-y-2 text-sm text-gray-600">
                  <p><b>Número:</b> #{mpReturnState.orderData.id}</p>
                  <p><b>Status:</b> Pagamento aprovado</p>
                  <p><b>Próximo passo:</b> Vamos te levar para o WhatsApp da loja para alinhar a entrega.</p>
                  {mpReturnState.orderData.customer_name && <p><b>Cliente:</b> {mpReturnState.orderData.customer_name}</p>}
                  {mpReturnState.orderData.delivery_method && <p><b>Entrega:</b> {String(mpReturnState.orderData.delivery_method).replace("_", " ")}</p>}
                  <p><b>Total:</b> R$ {Number(mpReturnState.orderData.total_amount || 0).toFixed(2)}</p>
                  {!!mpReturnState.orderData.items?.length && (
                    <div>
                      <p><b>Peças:</b></p>
                      <ul className="mt-1 space-y-1 text-gray-600">
                        {mpReturnState.orderData.items.slice(0, 4).map((item, index) => (
                          <li key={`${item.id || item.name}-${index}`}>• {item.quantitySelected || item.quantity || 1}x {item.name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            {mpReturnState.stage === "checking" && <p className="text-xs text-gray-400">Não feche esta página enquanto confirmamos seu pagamento.</p>}
            {mpReturnState.stage === "approved" && mpReturnState.continueUrl && (
              <p className="mb-4 text-xs text-green-700">
                Você será redirecionada automaticamente para o WhatsApp em {approvedRedirectCountdown}s para combinar a entrega.
              </p>
            )}
            {mpReturnState.stage === "pending" && (
              <div className="space-y-3">
                <button onClick={() => window.location.reload()} className="w-full bg-rose-500 text-white py-3 rounded-xl font-bold hover:bg-rose-600 transition">Verificar novamente</button>
                <button onClick={() => { setMpReturnHandled(true); window.location.href = mpReturnState.continueUrl; }} className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Falar com a loja no WhatsApp</button>
                <button onClick={() => navigate("/cart")} className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar para a sacola</button>
              </div>
            )}
            {(mpReturnState.stage === "approved" || mpReturnState.stage === "failure") && (
              <div className="space-y-3">
                {mpReturnState.continueUrl && <button onClick={() => { setMpReturnHandled(true); window.location.href = mpReturnState.continueUrl; }} className={`w-full py-3 rounded-xl font-bold transition ${mpReturnState.stage === "approved" ?"bg-green-600 text-white hover:bg-green-700" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>{mpReturnState.stage === "approved" ?"Ir para o WhatsApp" : "Falar com a loja"}</button>}
                {mpReturnState.stage === "failure" && <button onClick={() => window.location.reload()} className="w-full bg-rose-500 text-white py-3 rounded-xl font-bold hover:bg-rose-600 transition">Verificar novamente</button>}
                {mpReturnState.stage === "failure" && <button onClick={() => navigate("/cart")} className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar para a sacola</button>}
                {mpReturnState.stage === "approved" && <button onClick={() => navigate("/")} className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar para a loja</button>}
              </div>
            )}
            {mpReturnState.stage !== "checking" && <div className="mt-4 text-xs text-gray-400">O status mostrado aqui é conferido antes de liberar o próximo passo.</div>}
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <ShoppingBag size={64} className="text-gray-300 mb-4" />
        <p className="text-gray-500 text-lg">Seu carrinho está vazio.</p>
        <button onClick={() => navigate("/")} className="mt-4 text-rose-500 font-bold hover:underline">Voltar para a Loja</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-rose-50/30 py-8 px-4 font-sans text-gray-700">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-800">Finalizar Compra</h1>
        <div className="mb-8 overflow-x-auto pb-1">
          <div className="mx-auto flex min-w-max items-center justify-center gap-2 px-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${currentStep >= step ?"bg-rose-500 text-white shadow-lg shadow-rose-200" : "bg-gray-200 text-gray-500"}`}>{currentStep > step ?<Check size={14} /> : step}</div>
                {step < 4 && <div className={`w-8 h-1 mx-1 ${currentStep > step ?"bg-rose-500" : "bg-gray-200"}`}></div>}
              </div>
            ))}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {currentStep === 1 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><User className="text-rose-500" size={20} /> Seus Dados</h2>
                <div className="grid md:grid-cols-2 gap-3 mb-6">
                  <input placeholder="Nome Completo *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                  <input placeholder="WhatsApp (com DDD) *" inputMode="numeric" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formatPhoneDisplay(formData.phone)} onChange={(e) => setFormData({ ...formData, phone: digitsOnly(e.target.value).slice(0, 11) })} />
                  <input placeholder="CPF *" inputMode="numeric" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formatCpfDisplay(formData.cpf)} onChange={(e) => setFormData({ ...formData, cpf: digitsOnly(e.target.value).slice(0, 11) })} />
                  <input placeholder="E-mail *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><MapPin className="text-rose-500" size={20} /> Endereço</h2>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input placeholder="CEP *" className="p-3 border rounded-xl w-40 outline-none focus:border-rose-500 transition" value={formData.address.cep} onChange={(e) => { const val = e.target.value; setFormData({ ...formData, address: { ...formData.address, cep: val } }); if (val.length >= 8) searchCEP(val); }} />
                    {isLoadingCEP && <div className="flex items-center text-sm text-gray-400"><Loader2 className="animate-spin mr-1" /> Buscando...</div>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input placeholder="Rua *" className="col-span-2 p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.street} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} />
                    <input placeholder="Número *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.number} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, number: e.target.value } })} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input placeholder="Bairro *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.neighborhood} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, neighborhood: e.target.value } })} />
                    <input placeholder="Cidade *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.city} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, city: e.target.value } })} />
                  </div>
                  <input placeholder="Estado (UF) *" className="p-3 border rounded-xl w-24 outline-none focus:border-rose-500 transition" value={formData.address.state} onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })} />
                </div>
                <div className="mt-6 flex justify-end">
                  <button onClick={() => { const err = getCustomerError(); if (err) { alert(err); return; } setCurrentStep(2); }} className="bg-rose-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">Continuar para Entrega</button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><Truck className="text-rose-500" size={20} /> Método de Envio</h2>
                <div className="space-y-3">
                  {config?.enable_shipping_calc && <div onClick={() => setFormData({ ...formData, delivery_method: "correios" })} className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === "correios" ?"border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}><div><p className="font-bold text-gray-800">Correios / Envio</p><p className="text-xs text-gray-500">Entrega para todo Brasil</p></div><span className="font-bold text-rose-500">R$ {shippingPrice.toFixed(2)}</span></div>}
                  {config?.enable_pickup && <div onClick={() => setFormData({ ...formData, delivery_method: "retirada" })} className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === "retirada" ?"border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}><div><p className="font-bold text-gray-800">Retirada na Loja</p><p className="text-xs text-gray-500">Busque seu pedido</p></div><span className="font-bold text-green-600">Grátis</span></div>}
                  {config?.enable_uber && <div onClick={() => setFormData({ ...formData, delivery_method: "uber" })} className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === "uber" ?"border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}><div><p className="font-bold text-gray-800">Uber Flash / 99</p><p className="text-xs text-gray-500">Entrega expressa</p></div><span className="font-bold text-gray-600">A combinar</span></div>}
                </div>
                <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                  <button onClick={() => setCurrentStep(1)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                  <button onClick={() => { const err = getStep2Error(); if (err) { alert(err); return; } setCurrentStep(3); }} className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">Ir para Pagamento</button>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><CreditCard className="text-rose-500" size={20} /> Pagamento</h2>
                <div className="space-y-3">
                  {config?.enable_pix && <div onClick={() => setFormData({ ...formData, payment_method: "pix" })} className={`p-4 border-2 rounded-xl cursor-pointer flex items-center justify-between gap-3 transition-all ${formData.payment_method === "pix" ?"border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}><div className="flex items-center gap-3"><Smartphone className={formData.payment_method === "pix" ?"text-rose-500" : "text-gray-400"} /><div><span className="font-bold text-gray-700 block">PIX (Aprovação imediata)</span><span className="text-xs text-gray-500">Mais rápido para confirmar e seguir com seu pedido.</span></div></div><span className="text-[11px] uppercase tracking-[0.18em] text-emerald-600 font-bold">Mais usado</span></div>}
                  {config?.enable_credit_card && <div onClick={() => setFormData({ ...formData, payment_method: "card" })} className={`p-4 border-2 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${formData.payment_method === "card" ?"border-rose-500 bg-rose-50" : "border-gray-100 hover:border-gray-300"}`}><CreditCard className={formData.payment_method === "card" ?"text-rose-500" : "text-gray-400"} /><div><span className="font-bold text-gray-700 block">Cartão de Crédito</span><span className="text-xs text-gray-500">Pagamento protegido pelo checkout do Mercado Pago.</span></div></div>}
                </div>
                <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                  <button onClick={() => setCurrentStep(2)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                  <button onClick={() => { if (!isPaymentMethodAvailable(formData.payment_method)) { alert("Selecione uma forma de pagamento disponível para continuar."); return; } setCurrentStep(4); }} className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">Revisar Pedido</button>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><Check className="text-rose-500" size={20} /> Revisão Final</h2>
                <div className="bg-blue-50 border border-blue-200 p-5 rounded-xl mb-4">
                  <h3 className="font-bold text-blue-800 mb-2 flex items-center justify-center gap-2"><CreditCard size={18} /> Pagamento Seguro</h3>
                  <p className="text-xs text-blue-700 mb-3 text-center">Ao clicar em <b>"Confirmar e Enviar Pedido"</b>, você será redirecionada para o checkout protegido do Mercado Pago.</p>
                  <p className="text-[11px] text-center text-gray-500 mb-4">
                    Ao finalizar, você concorda com as políticas da loja sobre <b>envios</b> e entende que trabalhamos com <b>peças únicas</b>, sem troca por gosto ou tamanho.
                  </p>
                  <div className="grid gap-2 text-[11px] text-blue-900 sm:grid-cols-3">
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">Seu pedido já fica registrado antes do pagamento.</div>
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">A confirmação é conferida antes de liberar o próximo passo.</div>
                    <div className="rounded-xl bg-white/70 px-3 py-2 text-center">Depois da aprovação, seguimos pelo WhatsApp para alinhar a entrega.</div>
                  </div>
                </div>
                <div className="space-y-3 text-sm text-gray-600 mt-4 border-t pt-4">
                  <p><b>Nome:</b> {formData.name}</p>
                  <p><b>WhatsApp:</b> {formatPhoneDisplay(formData.phone)}</p>
                  <p><b>CPF:</b> {formatCpfDisplay(formData.cpf)}</p>
                  <p><b>E-mail:</b> {formData.email}</p>
                  <p><b>Endereço:</b> {formData.delivery_method === "retirada" ?"Retirada na loja" : `${formData.address.street}, ${formData.address.number}`}</p>
                  <p className="capitalize"><b>Envio:</b> {formData.delivery_method.replace("_", " ")}</p>
                  <p><b>Pagamento:</b> {formData.payment_method === "pix" ?"PIX" : "Cartão de crédito"}</p>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-700">Confira seus dados antes de finalizar. Isso ajuda a loja a separar a peça certa, confirmar seu pagamento e alinhar a entrega sem erro.</div>
                </div>
                <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
                  <button onClick={() => setCurrentStep(3)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                  <button onClick={handleFinalize} disabled={loading} className="flex-1 text-white px-4 py-3 rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700">{loading ?"Processando..." : "Confirmar e Enviar Pedido"}</button>
                </div>
              </div>
            )}
          </div>

          <div className="h-fit space-y-4">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-4">
              <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-800"><ShoppingBag size={18} /> Seu Pedido</h3>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {cart.map((item, idx) => <div key={idx} className="flex gap-3 text-sm border-b pb-3 border-gray-100 last:border-0">{item.image && <img src={item.image} className="w-12 h-12 rounded bg-gray-100 object-cover" />}<div className="flex-1"><p className="font-bold text-gray-700">{item.name}</p><p className="text-gray-500 text-xs">Qtd: {item.quantitySelected || item.quantity || 1}</p></div><span className="font-bold text-gray-700">R$ {(item.price * (item.quantitySelected || item.quantity || 1)).toFixed(2)}</span></div>)}
              </div>
              <div className="rounded-xl bg-[#fff7f4] border border-rose-100 px-4 py-3 mb-4"><p className="text-[11px] uppercase tracking-[0.2em] text-rose-400 font-bold mb-1">Compra com segurança</p><p className="text-xs text-gray-600">Estoque validado no pedido, pagamento via Mercado Pago, confirmação antes do redirecionamento e contato direto com a loja quando precisar.</p></div>
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-sm text-gray-500"><span>Entrega</span><span className={shippingPrice === 0 ?"text-green-600 font-bold" : ""}>{shippingPrice === 0 ?"Grátis" : `R$ ${shippingPrice.toFixed(2)}`}</span></div>
                <div className="flex justify-between font-bold text-xl text-rose-500 pt-2 border-t mt-2"><span>Total</span><span>R$ {total.toFixed(2)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
