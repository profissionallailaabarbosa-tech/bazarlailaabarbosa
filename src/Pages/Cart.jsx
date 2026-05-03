import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageCircle, ShoppingBag, Trash } from "lucide-react";

const readCartStorage = () => JSON.parse(localStorage.getItem("carrinho_laila") || "[]");

export default function Cart() {
  const navigate = useNavigate();
  const [cart, setCart] = useState(() => readCartStorage());

  useEffect(() => {
    const syncCart = () => {
      setCart(readCartStorage());
    };

    window.addEventListener("storage", syncCart);
    window.addEventListener("cart-updated", syncCart);
    return () => {
      window.removeEventListener("storage", syncCart);
      window.removeEventListener("cart-updated", syncCart);
    };
  }, []);

  function removeItem(index) {
    const newCart = [...cart];
    newCart.splice(index, 1);
    localStorage.setItem("carrinho_laila", JSON.stringify(newCart));
    setCart(newCart);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("cart-updated"));
  }

  function updateQuantity(index, newQty) {
    if (newQty < 1) return;
    const newCart = [...cart];
    newCart[index].quantitySelected = newQty;
    localStorage.setItem("carrinho_laila", JSON.stringify(newCart));
    setCart(newCart);
    window.dispatchEvent(new Event("storage"));
    window.dispatchEvent(new Event("cart-updated"));
  }

  const subtotal = cart.reduce(
    (acc, item) => acc + Number(item.price || 0) * Number(item.quantitySelected || item.quantity || 1),
    0
  );

  const handleCheckout = () => {
    localStorage.setItem("checkout_data", JSON.stringify({ items: cart }));
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
      <div className="mx-auto max-w-[28rem] p-3 sm:max-w-4xl sm:p-4 lg:py-10">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <ShoppingBag className="text-rose-500" /> Minha Sacola
        </h1>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {cart.map((item, index) => (
              <div key={index} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 items-center animate-in fade-in">
                <img
                  src={item.image}
                  alt={item.name}
                  loading="lazy"
                  decoding="async"
                  sizes="80px"
                  className="w-20 h-20 object-cover rounded-lg bg-gray-100"
                />
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800 line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-gray-500 mb-1">Tam: {item.size || "UN"} | {item.category}</p>
                  <p className="text-rose-500 font-bold">R$ {Number(item.price || 0).toFixed(2)}</p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <button onClick={() => removeItem(index)} className="text-gray-300 hover:text-red-500 transition">
                    <Trash size={18} />
                  </button>
                  <div className="flex items-center border border-gray-200 rounded bg-gray-50 h-8">
                    <button onClick={() => updateQuantity(index, (item.quantitySelected || 1) - 1)} className="px-2 text-gray-500 hover:text-rose-500 font-bold">-</button>
                    <span className="w-6 text-center text-xs font-bold">{item.quantitySelected || item.quantity || 1}</span>
                    <button onClick={() => updateQuantity(index, Number(item.quantitySelected || item.quantity || 1) + 1)} className="px-2 text-gray-500 hover:text-rose-500 font-bold">+</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <MessageCircle size={16} className="text-rose-500" /> Entrega combinada
              </h3>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-900">
                Nome, WhatsApp e e-mail serão pedidos no checkout.
                Endereço, frete, Correios, retirada ou entrega ficam combinados depois direto com a loja no WhatsApp.
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
              <div className="space-y-2 text-sm mb-4 border-b border-gray-100 pb-4">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>R$ {subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Entrega / frete</span>
                  <span className="font-semibold text-amber-600">A combinar</span>
                </div>
              </div>

              <div className="flex justify-between items-end mb-3">
                <span className="font-bold text-gray-800">Total agora</span>
                <div className="text-right">
                  <span className="block text-2xl font-bold text-rose-500">R$ {subtotal.toFixed(2)}</span>
                  <span className="text-[10px] text-gray-400">valor das peças</span>
                </div>
              </div>

              <p className="mb-6 text-[11px] leading-relaxed text-gray-400">
                O valor acima é das peças. O restante da entrega fica alinhado com a loja depois da compra.
              </p>

              <button onClick={handleCheckout} className="w-full bg-rose-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-rose-200 hover:bg-rose-600 transition active:scale-95 flex justify-center items-center gap-2">
                Ir para o checkout <MessageCircle size={18} />
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
