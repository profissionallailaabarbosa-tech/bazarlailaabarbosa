import React, { useState } from "react";
import { supabase } from "../api/supabase";
import { Search, Package, Clock, CheckCircle, Truck } from "lucide-react";

export default function OrderTracking() {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!phone) return alert("Digite seu telefone");
    
    setLoading(true);
    setSearched(true);
    
    try {
      // Busca pedidos pelo telefone
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .ilike('customer_phone', `%${phone}%`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data);
    } catch (error) {
      console.error(error);
      alert("Erro ao buscar pedidos");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    if (status === 'Entregue') return 'bg-green-100 text-green-700 border-green-200';
    if (status === 'Enviado') return 'bg-blue-100 text-blue-700 border-blue-200';
    if (status?.includes('Pago')) return 'bg-teal-100 text-teal-700 border-teal-200';
    return 'bg-yellow-100 text-yellow-700 border-yellow-200';
  };

  const getStatusIcon = (status) => {
    if (status === 'Entregue') return <CheckCircle size={16}/>;
    if (status === 'Enviado') return <Truck size={16}/>;
    return <Clock size={16}/>;
  };

  return (
    <div className="min-h-screen bg-rose-50/30 py-10 px-4 font-sans">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Rastrear Meus Pedidos</h1>
          <p className="text-gray-500 text-sm">Digite seu número de WhatsApp para ver o status.</p>
        </div>

        <form onSubmit={handleSearch} className="bg-white p-2 rounded-xl shadow-sm border border-gray-100 flex gap-2 mb-8">
          <input 
            type="tel" 
            placeholder="Ex: 11999999999" 
            className="flex-1 p-3 outline-none text-gray-700 placeholder:text-gray-300"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <button disabled={loading} className="bg-rose-500 text-white px-6 rounded-lg font-bold hover:bg-rose-600 transition flex items-center gap-2">
             {loading ? "..." : <><Search size={18}/> Buscar</>}
          </button>
        </form>

        <div className="space-y-4">
            {orders && orders.length > 0 ? (
                orders.map(order => (
                    <div key={order.id} className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-2">
                        <div className="flex justify-between items-start mb-4 border-b border-gray-50 pb-3">
                            <div>
                                <h3 className="font-bold text-gray-800 text-sm">Pedido #{order.id}</h3>
                                <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${getStatusColor(order.status)}`}>
                                {getStatusIcon(order.status)} {order.status}
                            </span>
                        </div>
                        
                        <div className="space-y-2 mb-4">
                            {order.items?.map((item, idx) => (
                                <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                                    <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500">{item.quantitySelected || 1}</span>
                                    <span>{item.name}</span>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center pt-2">
                             <span className="text-xs text-gray-400">Total</span>
                             <span className="font-bold text-rose-500">R$ {order.total_amount}</span>
                        </div>
                    </div>
                ))
            ) : (
                searched && !loading && (
                    <div className="text-center py-10 text-gray-400">
                        <Package size={48} className="mx-auto mb-3 opacity-20"/>
                        <p>Nenhum pedido encontrado.</p>
                    </div>
                )
            )}
        </div>
      </div>
    </div>
  );
}