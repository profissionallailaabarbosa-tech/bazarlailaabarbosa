import React, { useState } from "react";
import { supabase } from "../api/supabase";
import { Search, Package, Clock, CheckCircle, Truck, CreditCard, Smartphone } from "lucide-react";

export default function OrderTracking() {
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
  const formatPhoneDisplay = (value) => {
    const digits = normalizePhone(value).slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
  };

  const formatCurrency = (value) => `R$ ${Number(value || 0).toFixed(2)}`;

  const handleSearch = async (e) => {
    e.preventDefault();
    const phoneDigits = normalizePhone(phone);
    const orderDigits = normalizePhone(orderId);
    if (phoneDigits.length < 10) return alert("Digite o WhatsApp usado no pedido com DDD.");
    if (!orderDigits) return alert("Informe também o número do pedido para consultar com mais segurança.");

    setLoading(true);
    setSearched(true);

    try {
      const { data, error } = await supabase.rpc("lookup_orders_by_phone", {
        p_phone: phoneDigits,
        p_order_id: Number(orderDigits),
      });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error(error);
      alert("Erro ao buscar pedidos");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === "Entregue") return "bg-green-100 text-green-700 border-green-200";
    if (status === "Enviado") return "bg-blue-100 text-blue-700 border-blue-200";
    if (status?.includes("Pago")) return "bg-teal-100 text-teal-700 border-teal-200";
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  };

  const getStatusIcon = (status) => {
    if (status === "Entregue") return <CheckCircle size={16} />;
    if (status === "Enviado") return <Truck size={16} />;
    return <Clock size={16} />;
  };

  const getPaymentLabel = (paymentStatus) => {
    const normalized = String(paymentStatus || "").toLowerCase();
    if (normalized === "approved") return "Pagamento aprovado";
    if (normalized === "pending" || normalized === "in_process") return "Aguardando confirmação";
    if (normalized === "payment_link_error") return "Falha ao iniciar pagamento";
    return paymentStatus || "Aguardando";
  };

  const getOrderHint = (order) => {
    const status = String(order?.status || "").toLowerCase();
    const paymentStatus = String(order?.payment_status || "").toLowerCase();
    if (status === "entregue") return "Seu pedido já foi concluído.";
    if (status === "enviado") return "Seu pedido já saiu para entrega.";
    if (paymentStatus === "approved") return "Pagamento aprovado. A loja deve seguir com a entrega.";
    return "Pedido recebido. Aguarde a próxima atualização da loja.";
  };

  const visibleOrders = (orders || []).filter((order) => {
    const paymentStatus = String(order?.payment_status || "").toLowerCase();
    const status = String(order?.status || "").toLowerCase();
    const hiddenPaymentStatuses = ["payment_link_error", "rejected", "cancelled", "charged_back"];
    if (hiddenPaymentStatuses.includes(paymentStatus)) return false;
    if (status === "expirado") return false;
    return true;
  });

  return (
    <div className="min-h-screen bg-rose-50/30 px-3 py-10 font-sans sm:px-4">
      <div className="mx-auto max-w-[28rem] sm:max-w-xl">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-2xl font-bold text-gray-800">Rastrear Meus Pedidos</h1>
          <p className="text-sm text-gray-500">Digite o WhatsApp usado na compra e o número do pedido para consultar com mais segurança.</p>
          <p className="mt-2 text-xs text-gray-400">O número do pedido aparece na confirmação de pagamento e também na mensagem do WhatsApp da loja.</p>
        </div>

        <form onSubmit={handleSearch} className="mb-8 space-y-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <input
            type="tel"
            placeholder="WhatsApp usado no pedido"
            className="w-full rounded-lg border border-gray-100 p-3 text-base text-gray-700 outline-none placeholder:text-gray-300 sm:text-sm"
            inputMode="numeric"
            value={formatPhoneDisplay(phone)}
            onChange={(e) => setPhone(normalizePhone(e.target.value).slice(0, 11))}
          />
          <input
            type="tel"
            placeholder="Número do pedido"
            className="w-full rounded-lg border border-gray-100 p-3 text-base text-gray-700 outline-none placeholder:text-gray-300 sm:text-sm"
            inputMode="numeric"
            value={orderId}
            onChange={(e) => setOrderId(normalizePhone(e.target.value).slice(0, 18))}
          />
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-rose-500 px-6 py-3 font-bold text-white transition hover:bg-rose-600">
            {loading ? "Buscando..." : <><Search size={18} /> Buscar</>}
          </button>
        </form>

        {visibleOrders.length > 0 && (
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
            Encontramos {visibleOrders.length} {visibleOrders.length === 1 ? "pedido" : "pedidos"} para essa busca.
          </div>
        )}

        <div className="space-y-4">
          {visibleOrders.length > 0 ? (
            visibleOrders.map((order) => (
              <div key={order.id} className="animate-in slide-in-from-bottom-2 rounded-xl border border-gray-100 bg-white p-5 shadow-sm fade-in">
                <div className="mb-4 flex items-start justify-between border-b border-gray-50 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-800">Pedido #{order.id}</h3>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                  <span className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${getStatusColor(order.status)}`}>
                    {getStatusIcon(order.status)} {order.status}
                  </span>
                </div>

                <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  {getOrderHint(order)}
                </div>

                <div className="mb-4 space-y-2">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                        {item.quantitySelected || item.quantity || 1}
                      </span>
                      <span>{item.name}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-gray-400">Total</span>
                  <span className="font-bold text-rose-500">{formatCurrency(order.total_amount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">Pagamento</span>
                  <span className="inline-flex items-center gap-2 text-right text-sm font-semibold text-gray-600">
                    {String(order.payment_method || "").toLowerCase() === "pix" ? <Smartphone size={14} className="text-rose-400" /> : <CreditCard size={14} className="text-rose-400" />}
                    {getPaymentLabel(order.payment_status)}
                  </span>
                </div>
              </div>
            ))
          ) : (
            searched &&
            !loading && (
              <div className="py-10 text-center text-gray-400">
                <Package size={48} className="mx-auto mb-3 opacity-20" />
                <p>Nenhum pedido encontrado para essa busca.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
