import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trash, ArrowLeft, ShoppingBag, Truck, MapPin, Loader2 } from "lucide-react";

export default function Cart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [total, setTotal] = useState(0);

  // Estados do Frete
  const [cep, setCep] = useState("");
  const [address, setAddress] = useState(null);
  const [shippingOptions, setShippingOptions] = useState(null);
  const [selectedShipping, setSelectedShipping] = useState(null);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    loadCart();
    // Ouve mudanças no localStorage (caso adicione algo em outra aba)
    window.addEventListener("storage", loadCart);
    return () => window.removeEventListener("storage", loadCart);
  }, []);

  // Atualiza totais quando muda o carrinho ou o frete escolhido
  useEffect(() => {
    const itemsTotal = cart.reduce((acc, item) => acc + (item.price * item.quantitySelected), 0);
    const frete = selectedShipping ? selectedShipping.price : 0;
    setTotal(itemsTotal + frete);
  }, [cart, selectedShipping]);

  function loadCart() {
    const saved = JSON.parse(localStorage.getItem("carrinho_laila") || "[]");
    setCart(saved);
  }

  function removeItem(index) {
    const newCart = [...cart];
    newCart.splice(index, 1);
    localStorage.setItem("carrinho_laila", JSON.stringify(newCart));
    setCart(newCart);
    window.dispatchEvent(new Event("storage"));
  }

  function updateQuantity(index, newQty) {
    if (newQty < 1) return;
    const newCart = [...cart];
    newCart[index].quantitySelected = newQty;
    localStorage.setItem("carrinho_laila", JSON.stringify(newCart));
    setCart(newCart);
    window.dispatchEvent(new Event("storage"));
  }

  // --- LÓGICA DO FRETE INTELIGENTE ---
  async function handleCalculateShipping(e) {
    e.preventDefault();
    if (cep.length !== 8) return alert("Digite um CEP válido (8 números)");

    setLoadingCep(true);
    setShippingOptions(null);
    setSelectedShipping(null);
    setAddress(null);

    try {
        // 1. Busca o endereço no ViaCEP
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
            alert("CEP não encontrado!");
            setLoadingCep(false);
            return;
        }

        setAddress(data);

        // 2. Tabela de Preços (Simulação Inteligente)
        // Você pode ajustar esses valores conforme seus custos reais
        let pacPrice = 25.00;
        let sedexPrice = 45.00;
        let pacDays = 8;
        let sedexDays = 3;

        // Regra para SP (Estado Local - Mais barato)
        if (data.uf === 'SP') {
            pacPrice = 18.90;
            sedexPrice = 29.90;
            pacDays = 5;
            sedexDays = 2;
        } 
        // Regra para Vizinhos (MG, RJ, PR)
        else if (['MG', 'RJ', 'PR'].includes(data.uf)) {
            pacPrice = 28.50;
            sedexPrice = 55.00;
            pacDays = 7;
            sedexDays = 3;
        }
        // Regra para Longe (Norte/Nordeste)
        else if (['BA', 'PE', 'CE', 'MA', 'AM', 'PA'].includes(data.uf)) {
            pacPrice = 55.00;
            sedexPrice = 89.90;
            pacDays = 12;
            sedexDays = 5;
        }

        setShippingOptions([
            { type: 'PAC', price: pacPrice, days: pacDays },
            { type: 'SEDEX', price: sedexPrice, days: sedexDays }
        ]);

    } catch (error) {
        alert("Erro ao buscar CEP. Tente novamente.");
    } finally {
        setLoadingCep(false);
    }
  }

  const handleCheckout = () => {
      // Salva o total final e o frete para usar na página de Checkout
      const checkoutData = {
          items: cart,
          shipping: selectedShipping,
          address: address, // Já manda o endereço pré-preenchido
          totalFinal: total
      };
      localStorage.setItem("checkout_data", JSON.stringify(checkoutData));
      navigate("/checkout");
  };

  if (cart.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <ShoppingBag size={64} className="text-gray-300 mb-4" />
        <h2 className="text-xl font-bold text-gray-600 mb-2">Sua sacola está vazia</h2>
        <p className="text-gray-400 mb-6">Que tal dar uma olhada nas novidades?</p>
        <Link to="/" className="bg-rose-500 text-white px-8 py-3 rounded-full font-bold hover:bg-rose-600 transition shadow-lg">
          Ver Produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-700 pb-20">
      <div className="max-w-4xl mx-auto p-4 lg:py-10">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShoppingBag className="text-rose-500" /> Minha Sacola
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* LISTA DE PRODUTOS */}
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item, index) => (
              <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 items-center animate-in fade-in">
                <img src={item.image} alt={item.name} className="w-20 h-20 object-cover rounded-lg bg-gray-100" />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-gray-500 mb-1">Tam: {item.size || 'UN'} | {item.category}</p>
                  <p className="text-rose-500 font-bold">R$ {item.price.toFixed(2)}</p>
                </div>
                
                <div className="flex flex-col items-end gap-2">
                    <button onClick={() => removeItem(index)} className="text-gray-300 hover:text-red-500 transition">
                        <Trash size={18} />
                    </button>
                    <div className="flex items-center border border-gray-200 rounded bg-gray-50 h-8">
                        <button onClick={() => updateQuantity(index, item.quantitySelected - 1)} className="px-2 text-gray-500 hover:text-rose-500 font-bold">-</button>
                        <span className="w-6 text-center text-xs font-bold">{item.quantitySelected}</span>
                        <button onClick={() => updateQuantity(index, item.quantitySelected + 1)} className="px-2 text-gray-500 hover:text-rose-500 font-bold">+</button>
                    </div>
                </div>
              </div>
            ))}
          </div>

          {/* RESUMO E FRETE */}
          <div className="lg:col-span-1 space-y-6">
            
            {/* Calculadora de Frete */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><Truck size={16} className="text-rose-500"/> Calcular Frete</h3>
                
                <form onSubmit={handleCalculateShipping} className="flex gap-2 mb-3">
                    <input 
                        value={cep} 
                        onChange={e => setCep(e.target.value.replace(/\D/g, ''))}
                        placeholder="Seu CEP" 
                        maxLength={8}
                        className="flex-1 border border-gray-200 rounded-lg p-2 text-sm outline-none focus:border-rose-500"
                    />
                    <button disabled={loadingCep} className="bg-gray-800 text-white px-4 rounded-lg text-xs font-bold hover:bg-black transition flex items-center">
                        {loadingCep ? <Loader2 className="animate-spin"/> : "OK"}
                    </button>
                </form>

                {address && (
                    <div className="text-xs text-gray-500 mb-3 bg-gray-50 p-2 rounded">
                        <MapPin size={10} className="inline mr-1"/>
                        {address.logradouro}, {address.localidade}-{address.uf}
                    </div>
                )}

                {shippingOptions && (
                    <div className="space-y-2">
                        {shippingOptions.map((opt, i) => (
                            <label key={i} className={`flex justify-between items-center p-3 border rounded-lg cursor-pointer transition-all ${selectedShipping?.type === opt.type ? 'border-rose-500 bg-rose-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="radio" 
                                        name="shipping" 
                                        className="accent-rose-500"
                                        checked={selectedShipping?.type === opt.type}
                                        onChange={() => setSelectedShipping(opt)}
                                    />
                                    <div>
                                        <p className="font-bold text-xs text-gray-800">{opt.type}</p>
                                        <p className="text-[10px] text-gray-500">Chega em até {opt.days} dias úteis</p>
                                    </div>
                                </div>
                                <span className="font-bold text-sm text-rose-500">R$ {opt.price.toFixed(2)}</span>
                            </label>
                        ))}
                    </div>
                )}
            </div>

            {/* Total */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="space-y-2 text-sm mb-4 border-b border-gray-100 pb-4">
                <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>R$ {cart.reduce((acc, item) => acc + (item.price * item.quantitySelected), 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                    <span>Frete</span>
                    <span>{selectedShipping ? `R$ ${selectedShipping.price.toFixed(2)}` : '--'}</span>
                </div>
              </div>
              
              <div className="flex justify-between items-end mb-6">
                 <span className="font-bold text-gray-800">Total</span>
                 <div className="text-right">
                    <span className="block text-2xl font-bold text-rose-500">R$ {total.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">ou até 3x sem juros</span>
                 </div>
              </div>

              <button onClick={handleCheckout} className="w-full bg-rose-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-600 transition active:scale-95 flex justify-center items-center gap-2">
                 Finalizar Compra <Truck size={18}/>
              </button>
              
              <Link to="/" className="block text-center text-xs text-gray-400 mt-4 hover:text-rose-500 underline">
                Continuar comprando
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}