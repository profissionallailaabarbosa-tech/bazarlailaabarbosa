import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { ArrowLeft, ShoppingBag, Truck, ShieldCheck, Minus, Plus } from "lucide-react";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  
  // Controle da Foto Principal (Começa com a capa, muda ao clicar nas pequenas)
  const [selectedImage, setSelectedImage] = useState(null);

  // --- CARREGA O PRODUTO (Busca Galeria) ---
  useEffect(() => {
    async function loadProduct() {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        if (data) {
            setProduct(data);
            setSelectedImage(data.image); // A primeira foto é a capa
        }
      } catch (err) {
        console.error("Erro ao carregar:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProduct();
  }, [id]);

  // --- FUNÇÃO DE SEGURANÇA (TRY/CATCH) - Mantida do seu código! ---
  const saveToCart = (items) => {
    try {
        localStorage.setItem("carrinho_laila", JSON.stringify(items));
        return true;
    } catch (e) {
        console.error("Memória cheia:", e);
        alert("⚠️ A memória do carrinho encheu! Vamos limpar itens antigos para caber o novo.");
        localStorage.removeItem("carrinho_laila"); 
        localStorage.setItem("carrinho_laila", JSON.stringify([items[items.length - 1]])); 
        return true;
    }
  };

  // --- ADICIONAR À SACOLA ---
  const handleAddToCart = () => {
    if (!product) return;
    const cart = JSON.parse(localStorage.getItem("carrinho_laila") || "[]");
    
    // Verifica se já existe para somar quantidade
    const existingIndex = cart.findIndex(item => item.id === product.id);
    
    if (existingIndex >= 0) {
        cart[existingIndex].quantitySelected = (cart[existingIndex].quantitySelected || 1) + quantity;
    } else {
        cart.push({ ...product, quantitySelected: quantity });
    }
    
    if (saveToCart(cart)) {
        window.dispatchEvent(new Event("storage")); // Atualiza o ícone da sacola
        navigate("/cart");
    }
  };

  // --- COMPRAR AGORA ---
  const handleBuyNow = () => {
    if (!product) return;
    handleAddToCart();
    navigate("/checkout");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-rose-500">Carregando...</div>;
  if (!product) return <div className="min-h-screen flex items-center justify-center">Produto não encontrado.</div>;

  // Junta a capa com a galeria para fazer a lista de fotos
  const allImages = [product.image, ...(product.gallery || [])].filter(Boolean);
  const maxStock = parseInt(product.quantity) || 1;
  const isSoldOut = maxStock <= 0;

  return (
    <div className="min-h-screen bg-white pb-20 pt-4 font-sans text-gray-700">
      <div className="max-w-6xl mx-auto px-4 lg:py-10">
        
        {/* Botão Voltar */}
        <button onClick={() => navigate(-1)} className="flex items-center text-gray-500 hover:text-rose-500 mb-6 font-medium transition">
          <ArrowLeft className="mr-2" size={20} /> Voltar
        </button>

        <div className="grid lg:grid-cols-2 gap-10">
          
          {/* --- ESQUERDA: GALERIA DE FOTOS --- */}
          <div className="space-y-4">
             {/* Foto Grande */}
             <div className="aspect-[3/4] lg:aspect-square bg-gray-50 rounded-2xl overflow-hidden shadow-sm border border-gray-100 relative">
                <img src={selectedImage} alt={product.name} className="w-full h-full object-cover animate-in fade-in duration-500" />
                {isSoldOut && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-red-600 text-white font-bold px-6 py-2 rounded-full transform -rotate-12 border-2 border-white shadow-lg">ESGOTADO</span>
                  </div>
                )}
             </div>

             {/* Carrossel de Miniaturas (Só aparece se tiver mais de 1 foto) */}
             {allImages.length > 1 && (
                 <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                     {allImages.map((img, idx) => (
                         <button 
                            key={idx} 
                            onClick={() => setSelectedImage(img)}
                            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${selectedImage === img ? 'border-rose-500 ring-2 ring-rose-100' : 'border-transparent opacity-70 hover:opacity-100'}`}
                         >
                             <img src={img} className="w-full h-full object-cover" />
                         </button>
                     ))}
                 </div>
             )}
          </div>

          {/* --- DIREITA: INFORMAÇÕES --- */}
          <div className="lg:pl-10 space-y-6">
            <div>
              <span className="bg-rose-100 text-rose-600 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">{product.category}</span>
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mt-3 mb-2 capitalize">{product.name}</h1>
              <p className="text-2xl font-bold text-rose-500">R$ {product.price.toFixed(2)}</p>
            </div>

            <div className="prose text-gray-600 text-sm leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
              {product.description || "Peça exclusiva selecionada com carinho para você."}
            </div>

            {/* Seletor de Tamanho e Quantidade */}
            <div className="border-t border-b border-gray-100 py-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <span className="font-bold text-gray-700">Tamanho:</span>
                        <span className="h-10 px-4 flex items-center justify-center border-2 border-gray-800 rounded-lg font-bold text-gray-800 bg-white">
                            {product.size || "UN"}
                        </span>
                    </div>

                    <div className="flex items-center border border-gray-200 rounded-lg bg-white h-10">
                        <button onClick={() => setQuantity(q => Math.max(1, q - 1))} disabled={isSoldOut || quantity <= 1} className="px-3 h-full text-gray-400 hover:text-rose-500 disabled:opacity-30"><Minus size={16} /></button>
                        <span className="w-8 text-center font-bold text-gray-700">{quantity}</span>
                        <button onClick={() => setQuantity(q => Math.min(maxStock, q + 1))} disabled={isSoldOut || quantity >= maxStock} className="px-3 h-full text-gray-400 hover:text-rose-500 disabled:opacity-30"><Plus size={16} /></button>
                    </div>
                </div>
                <p className="text-xs text-gray-400 text-right">
                    {isSoldOut ? "Sem estoque" : `${maxStock} unidades disponíveis`}
                </p>
            </div>

            {/* Botões de Ação */}
            <div className="flex flex-col gap-3">
               <button 
                  onClick={handleBuyNow}
                  disabled={isSoldOut}
                  className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-200 transition-all flex items-center justify-center gap-2 text-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  Comprar Agora
               </button>
               
               <button 
                  onClick={handleAddToCart}
                  disabled={isSoldOut}
                  className="w-full border-2 border-gray-200 text-gray-600 font-bold py-4 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
               >
                  <ShoppingBag size={20} /> Adicionar à Sacola
               </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs text-gray-500 pt-4 text-center">
                <div className="flex items-center justify-center gap-2"><Truck size={16} className="text-rose-500"/> Entrega para todo Brasil</div>
                <div className="flex items-center justify-center gap-2"><ShieldCheck size={16} className="text-rose-500"/> Pagamento 100% Seguro</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}