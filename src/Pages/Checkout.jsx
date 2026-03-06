import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { buildWhatsAppLink } from "../utils/whatsapp";
import { 
  ShoppingBag, CreditCard, Smartphone, MapPin, User, Truck, Car, 
  Check, Edit2, Loader2, ArrowLeft, Copy, Clock, Camera, ExternalLink
} from "lucide-react";

export default function Checkout() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isLoadingCEP, setIsLoadingCEP] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);
  
  // Timer de 15 minutos (Charme de escassez)
  const [timeLeft, setTimeLeft] = useState(900); 

  const [currentStep, setCurrentStep] = useState(1);

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    cpf: "",
    address: {
      cep: "", street: "", number: "", complement: "",
      neighborhood: "", city: "", state: ""
    },
    payment_method: "pix",
    delivery_method: "retirada"
  });

  // Timer Lógica
  useEffect(() => {
    if (currentStep === 4 && formData.payment_method === 'pix' && timeLeft > 0) {
      const timerId = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timerId);
    }
  }, [currentStep, formData.payment_method, timeLeft]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  useEffect(() => {
    try {
        const savedCart = localStorage.getItem("carrinho_laila") || localStorage.getItem("cart");
        if (savedCart) setCart(JSON.parse(savedCart));
        
        async function loadSettings() {
          const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
          if (data) setConfig(data);
        }
        loadSettings();
    } catch (e) { console.error("Erro ao carregar", e); }
  }, []);

  const searchCEP = async (cep) => {
    const cleanCEP = cep.replace(/\D/g, "");
    if (cleanCEP.length !== 8) return;
    setIsLoadingCEP(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
      const data = await response.json();
      if (!data.erro) {
        setFormData(prev => ({
          ...prev,
          address: {
            ...prev.address,
            cep: cleanCEP,
            street: data.logradouro || "",
            neighborhood: data.bairro || "",
            city: data.localidade || "",
            state: data.uf || ""
          }
        }));
      } else { alert("CEP não encontrado."); }
    } catch { alert("Erro ao buscar CEP."); }
    setIsLoadingCEP(false);
  };

  const subtotal = cart.reduce((acc, item) => acc + (parseFloat(item.price) * (item.quantitySelected || item.quantity || 1)), 0);
  
  const shippingPrice = useMemo(() => {
    if (formData.delivery_method !== 'correios' || !config?.enable_shipping_calc) return 0;
    if (config.shipping_origin_cep && formData.address.cep) {
        const originPrefix = config.shipping_origin_cep.substring(0, 1);
        const destPrefix = formData.address.cep.substring(0, 1);
        return originPrefix === destPrefix ? (parseFloat(config.shipping_local_price) || 20) : (parseFloat(config.shipping_national_price) || 40);
    }
    return parseFloat(config.shipping_national_price) || 40;
  }, [formData.delivery_method, formData.address.cep, config]);

  const total = subtotal + shippingPrice;

  const canProceed = () => {
    if (currentStep === 1) return formData.name && formData.phone && formData.address.cep && formData.address.street && formData.address.number;
    return true;
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      const addressFull = formData.delivery_method === 'retirada' 
        ? 'Retirada na Loja' 
        : `${formData.address.street}, ${formData.address.number} - ${formData.address.neighborhood}, ${formData.address.city}/${formData.address.state} (CEP: ${formData.address.cep})`;

      // Status Inteligente
      let statusPagamentoBanco = 'Pendente';
      if (formData.payment_method === 'pix' && pixPaid) statusPagamentoBanco = 'Pago (Verificar)';
      if (formData.payment_method === 'card') statusPagamentoBanco = 'Aguardando Cartão';

      const { data: order, error } = await supabase.rpc("create_order_with_stock", {
        p_customer_name: formData.name,
        p_customer_phone: formData.phone,
        p_address: addressFull,
        p_total_amount: total,
        p_payment_method: formData.payment_method,
        p_delivery_method: formData.delivery_method,
        p_status: statusPagamentoBanco,
        p_items: cart,
      });

      if (error) throw error;


      const itemsList = cart.map(i => `• ${i.quantitySelected || 1}x ${i.name}`).join('\n');
      
      // --- MENSAGEM DO WHATSAPP OTIMIZADA ---
      let textoPagamento = formData.payment_method === 'pix' ? 'PIX' : 'Cartão de Crédito';
      let avisoExtra = "";
      
      if (formData.payment_method === 'pix' && pixPaid) {
          textoPagamento = 'PIX (✅ PAGO)';
          avisoExtra = "\n📸 *Estou enviando o comprovante abaixo!*";
      }
      if (formData.payment_method === 'card') {
          textoPagamento = 'Cartão (Link Acessado)';
          avisoExtra = "\n💳 *Fiz o pagamento pelo link do cartão!*";
      }

      const msg = `*NOVO PEDIDO #${order?.id}* 🎉\n\n*Cliente:* ${formData.name}\n*Pagamento:* ${textoPagamento}\n*Entrega:* ${formData.delivery_method}\n\n*Itens:*\n${itemsList}\n\n*Total:* R$ ${total.toFixed(2)}${avisoExtra}`;
      
      const whatsappSource = config?.whatsapp_number || config?.whatsapp;
      const whatsappUrl = buildWhatsAppLink(whatsappSource, msg);
      
      localStorage.removeItem("carrinho_laila");
      localStorage.removeItem("cart");
      window.location.href = whatsappUrl;

    } catch (err) {
      console.error(err);
      alert(err?.message || "Erro ao processar pedido. Tente novamente.");
      setLoading(false);
    }
  };

  if (cart.length === 0) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <ShoppingBag size={64} className="text-gray-300 mb-4"/>
        <p className="text-gray-500 text-lg">Seu carrinho está vazio.</p>
        <button onClick={() => navigate("/")} className="mt-4 text-rose-500 font-bold hover:underline">Voltar para a Loja</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-rose-50/30 py-8 px-4 font-sans text-gray-700">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-center mb-8 text-gray-800">Finalizar Compra</h1>

        <div className="flex justify-center mb-8">
            <div className="flex items-center gap-2">
                {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${currentStep >= step ? 'bg-rose-500 text-white shadow-lg shadow-rose-200' : 'bg-gray-200 text-gray-500'}`}>
                            {currentStep > step ? <Check size={14} /> : step}
                        </div>
                        {step < 4 && <div className={`w-8 h-1 mx-1 ${currentStep > step ? 'bg-rose-500' : 'bg-gray-200'}`}></div>}
                    </div>
                ))}
            </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
                
                {/* ETAPA 1: DADOS */}
                {currentStep === 1 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-left-4">
                        <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><User className="text-rose-500" size={20}/> Seus Dados</h2>
                        <div className="grid md:grid-cols-2 gap-3 mb-6">
                            <input placeholder="Nome Completo *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                            <input placeholder="WhatsApp (com DDD) *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                            <input placeholder="CPF (Opcional)" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
                            <input placeholder="Email (Opcional)" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>

                        <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><MapPin className="text-rose-500" size={20}/> Endereço</h2>
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <input placeholder="CEP *" className="p-3 border rounded-xl w-40 outline-none focus:border-rose-500 transition" value={formData.address.cep} onChange={e => {
                                    const val = e.target.value;
                                    setFormData({...formData, address: {...formData.address, cep: val}});
                                    if(val.length >= 8) searchCEP(val);
                                }} />
                                {isLoadingCEP && <div className="flex items-center text-sm text-gray-400"><Loader2 className="animate-spin mr-1"/> Buscando...</div>}
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <input placeholder="Rua *" className="col-span-2 p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.street} onChange={e => setFormData({...formData, address: {...formData.address, street: e.target.value}})} />
                                <input placeholder="Número *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.number} onChange={e => setFormData({...formData, address: {...formData.address, number: e.target.value}})} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <input placeholder="Bairro *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.neighborhood} onChange={e => setFormData({...formData, address: {...formData.address, neighborhood: e.target.value}})} />
                                <input placeholder="Cidade *" className="p-3 border rounded-xl outline-none focus:border-rose-500 transition" value={formData.address.city} onChange={e => setFormData({...formData, address: {...formData.address, city: e.target.value}})} />
                            </div>
                            <input placeholder="Estado (UF) *" className="p-3 border rounded-xl w-24 outline-none focus:border-rose-500 transition" value={formData.address.state} onChange={e => setFormData({...formData, address: {...formData.address, state: e.target.value}})} />
                        </div>

                        <div className="mt-6 flex justify-end">
                            <button onClick={() => canProceed() ? setCurrentStep(2) : alert("Preencha os campos obrigatórios")} className="bg-rose-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">
                                Continuar para Entrega
                            </button>
                        </div>
                    </div>
                )}

                {/* ETAPA 2: ENTREGA */}
                {currentStep === 2 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-left-4">
                        <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><Truck className="text-rose-500" size={20}/> Método de Envio</h2>
                        
                        <div className="space-y-3">
                            {config?.enable_shipping_calc && (
                                <div onClick={() => setFormData({...formData, delivery_method: 'correios'})} 
                                     className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === 'correios' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.delivery_method === 'correios' ? 'border-rose-500' : 'border-gray-300'}`}>
                                            {formData.delivery_method === 'correios' && <div className="w-2.5 h-2.5 rounded-full bg-rose-500"/>}
                                        </div>
                                        <div><p className="font-bold text-gray-800">Correios / Envio</p><p className="text-xs text-gray-500">Entrega para todo Brasil</p></div>
                                    </div>
                                    <span className="font-bold text-rose-500">R$ {shippingPrice.toFixed(2)}</span>
                                </div>
                            )}

                            {config?.enable_pickup && (
                                <div onClick={() => setFormData({...formData, delivery_method: 'retirada'})} 
                                     className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === 'retirada' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.delivery_method === 'retirada' ? 'border-rose-500' : 'border-gray-300'}`}>
                                            {formData.delivery_method === 'retirada' && <div className="w-2.5 h-2.5 rounded-full bg-rose-500"/>}
                                        </div>
                                        <div><p className="font-bold text-gray-800">Retirada na Loja</p><p className="text-xs text-gray-500">Busque seu pedido</p></div>
                                    </div>
                                    <span className="font-bold text-green-600">Grátis</span>
                                </div>
                            )}

                            {config?.enable_uber && (
                                <div onClick={() => setFormData({...formData, delivery_method: 'uber'})} 
                                     className={`p-4 border-2 rounded-xl cursor-pointer flex justify-between items-center transition-all ${formData.delivery_method === 'uber' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${formData.delivery_method === 'uber' ? 'border-rose-500' : 'border-gray-300'}`}>
                                            {formData.delivery_method === 'uber' && <div className="w-2.5 h-2.5 rounded-full bg-rose-500"/>}
                                        </div>
                                        <div><p className="font-bold text-gray-800">Uber Flash / 99</p><p className="text-xs text-gray-500">Entrega Express</p></div>
                                    </div>
                                    <span className="font-bold text-gray-600">A Combinar</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button onClick={() => setCurrentStep(1)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                            <button onClick={() => setCurrentStep(3)} className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">Ir para Pagamento</button>
                        </div>
                    </div>
                )}

                {/* ETAPA 3: PAGAMENTO */}
                {currentStep === 3 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-left-4">
                        <h2 className="flex items-center gap-2 font-bold text-lg mb-4 text-gray-800"><CreditCard className="text-rose-500" size={20}/> Pagamento</h2>
                        
                        <div className="space-y-3">
                            {config?.enable_pix && (
                                <div onClick={() => setFormData({...formData, payment_method: 'pix'})} 
                                     className={`p-4 border-2 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${formData.payment_method === 'pix' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                     <Smartphone className={formData.payment_method === 'pix' ? "text-rose-500" : "text-gray-400"} />
                                     <span className="font-bold text-gray-700">PIX (Aprovação Imediata)</span>
                                </div>
                            )}
                            {config?.enable_credit_card && (
                                <div onClick={() => setFormData({...formData, payment_method: 'card'})} 
                                     className={`p-4 border-2 rounded-xl cursor-pointer flex items-center gap-3 transition-all ${formData.payment_method === 'card' ? 'border-rose-500 bg-rose-50' : 'border-gray-100 hover:border-gray-300'}`}>
                                     <CreditCard className={formData.payment_method === 'card' ? "text-rose-500" : "text-gray-400"} />
                                     <span className="font-bold text-gray-700">Cartão de Crédito</span>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button onClick={() => setCurrentStep(2)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                            <button onClick={() => setCurrentStep(4)} className="flex-1 bg-rose-500 text-white px-4 py-3 rounded-xl font-bold hover:bg-rose-600 transition shadow-lg shadow-rose-200">Revisar Pedido</button>
                        </div>
                    </div>
                )}

                {/* ETAPA 4: RESUMO */}
                {currentStep === 4 && (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-left-4">
                        <h2 className="font-bold text-lg mb-4 text-gray-800 border-b pb-2">Resumo Geral</h2>
                        
                        {/* --- LÓGICA DO PIX --- */}
                        {formData.payment_method === 'pix' && config?.pix_key && (
                            <div className="bg-green-50 border border-green-200 p-4 rounded-xl mb-4 flex flex-col items-center text-center animate-in zoom-in-95 relative overflow-hidden">
                                <div className="absolute top-2 right-2 bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded flex items-center gap-1 animate-pulse">
                                    <Clock size={12}/> {formatTime(timeLeft)}
                                </div>
                                <h3 className="font-bold text-green-800 mb-1 mt-4">Pagamento via PIX</h3>
                                <p className="text-xs text-green-600 mb-3">Escaneie o QR Code ou copie a chave:</p>
                                <div className="bg-white p-2 rounded-lg border border-gray-200 mb-3">
                                     <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${config.pix_key}`} alt="QR Code Pix" />
                                </div>
                                <div className="w-full mb-4 flex gap-2">
                                    <input readOnly value={config.pix_key} className="flex-1 bg-white border border-green-200 rounded px-2 py-1 text-xs text-gray-600 outline-none" />
                                    <button type="button" onClick={() => { navigator.clipboard.writeText(config.pix_key); alert("Chave PIX copiada!"); }} className="bg-green-600 text-white px-3 py-1 rounded text-xs font-bold hover:bg-green-700 flex items-center gap-1">
                                        <Copy size={12}/> Copiar
                                    </button>
                                </div>
                                <div onClick={() => setPixPaid(!pixPaid)} className={`flex items-center gap-3 cursor-pointer bg-white px-4 py-3 rounded-lg border transition select-none w-full shadow-sm text-left ${pixPaid ? 'border-green-500 ring-1 ring-green-200' : 'border-green-200 hover:border-green-400'}`}>
                                   <div className={`w-5 h-5 min-w-[20px] rounded border flex items-center justify-center transition ${pixPaid ? 'bg-green-500 border-green-500' : 'border-gray-300 bg-white'}`}>
                                      {pixPaid && <Check size={14} className="text-white" />}
                                   </div>
                                   <div><span className="text-sm font-bold text-gray-800 block">Já realizei o pagamento</span></div>
                                </div>
                            </div>
                        )}

                        {/* --- LÓGICA DO CARTÃO (NOVO) --- */}
                        {formData.payment_method === 'card' && (
                             <div className="bg-blue-50 border border-blue-200 p-5 rounded-xl mb-4 text-center animate-in zoom-in-95">
                                 <h3 className="font-bold text-blue-800 mb-2 flex items-center justify-center gap-2"><CreditCard size={18}/> Pagamento Seguro</h3>
                                 <p className="text-xs text-blue-600 mb-4">Clique no botão abaixo para pagar com cartão:</p>
                                 
                                 {config?.payment_card_instructions ? (
                                     <a 
                                        href={config.payment_card_instructions.startsWith('http') ? config.payment_card_instructions : '#'} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200 flex items-center justify-center gap-2 mb-3 active:scale-95"
                                     >
                                         <ExternalLink size={18}/> Pagar com Cartão
                                     </a>
                                 ) : (
                                     <p className="text-red-500 text-xs bg-red-50 p-2 rounded">Link de pagamento não configurado no Admin.</p>
                                 )}
                                 
                                 <p className="text-[10px] text-gray-500 mt-2">
                                    Após realizar o pagamento, clique em <b>"Confirmar e Enviar Pedido"</b> abaixo para me avisar.
                                 </p>
                             </div>
                        )}
                        
                        <div className="space-y-2 text-sm text-gray-600 mt-4 border-t pt-4">
                            <p><b>Nome:</b> {formData.name}</p>
                            <p><b>Endereço:</b> {formData.address.street}, {formData.address.number}</p>
                            <p className="capitalize"><b>Envio:</b> {formData.delivery_method.replace('_', ' ')}</p>
                        </div>

                        <div className="mt-6 flex gap-3">
                            <button onClick={() => setCurrentStep(3)} className="flex-1 border border-gray-300 text-gray-600 px-4 py-3 rounded-xl font-bold hover:bg-gray-50 transition">Voltar</button>
                            <button onClick={handleFinalize} disabled={loading} className={`flex-1 text-white px-4 py-3 rounded-xl font-bold transition shadow-lg flex items-center justify-center gap-2 ${pixPaid || formData.payment_method === 'card' ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'}`}>
                                {loading ? "Processando..." : "Confirmar e Enviar Pedido"}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* DIREITA: RESUMO LATERAL */}
            <div className="h-fit space-y-4">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-4">
                    <h3 className="font-bold mb-4 flex items-center gap-2 text-gray-800"><ShoppingBag size={18}/> Seu Pedido</h3>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {cart.map((item, idx) => (
                            <div key={idx} className="flex gap-3 text-sm border-b pb-3 border-gray-100 last:border-0">
                                {item.image && <img src={item.image} className="w-12 h-12 rounded bg-gray-100 object-cover"/>}
                                <div className="flex-1">
                                    <p className="font-bold text-gray-700">{item.name}</p>
                                    <p className="text-gray-500 text-xs">Qtd: {item.quantitySelected || 1}</p>
                                </div>
                                <span className="font-bold text-gray-700">R$ {(item.price * (item.quantitySelected || 1)).toFixed(2)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="border-t pt-4 space-y-2">
                        <div className="flex justify-between text-sm text-gray-500"><span>Subtotal</span><span>R$ {subtotal.toFixed(2)}</span></div>
                        <div className="flex justify-between text-sm text-gray-500"><span>Entrega</span><span className={shippingPrice === 0 ? "text-green-600 font-bold" : ""}>{shippingPrice === 0 ? 'Grátis' : `R$ ${shippingPrice.toFixed(2)}`}</span></div>
                        <div className="flex justify-between font-bold text-xl text-rose-500 pt-2 border-t mt-2"><span>Total</span><span>R$ {total.toFixed(2)}</span></div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
