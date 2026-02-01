import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Package } from "lucide-react";

export default function Navbar() {
  const [cartCount, setCartCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const updateCount = () => {
      const savedCart = JSON.parse(localStorage.getItem("carrinho_laila") || "[]");
      setCartCount(savedCart.length);
    };
    updateCount();
    window.addEventListener("storage", updateCount);
    const interval = setInterval(updateCount, 1000);
    return () => { window.removeEventListener("storage", updateCount); clearInterval(interval); };
  }, []);

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          
          {/* Menu Mobile */}
          <div className="flex items-center md:hidden">
            <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-500 hover:text-rose-500">
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Logo */}
          <div className="flex-shrink-0 flex items-center justify-center flex-1 md:justify-start">
            <Link to="/" className="text-3xl md:text-4xl font-bold text-rose-500 hover:opacity-80 transition-opacity" style={{ fontFamily: "'Great Vibes', cursive" }}>
              Laila Barbosa
            </Link>
          </div>

          {/* Links Centrais (Desktop) */}
          <div className="hidden md:flex space-x-8 items-center">
            <Link to="/" className="text-gray-600 hover:text-rose-500 font-medium transition-colors uppercase text-xs tracking-widest">Home</Link>
            <Link to="/#products-section" className="text-gray-600 hover:text-rose-500 font-medium transition-colors uppercase text-xs tracking-widest">Produtos</Link>
            
            {/* Link Rastrear Novo */}
            <Link to="/rastrear" className="text-gray-600 hover:text-rose-500 font-medium transition-colors uppercase text-xs tracking-widest flex items-center gap-1">
               <Package className="w-3 h-3" /> Meus Pedidos
            </Link>

            <Link to="/admin" className="text-gray-400 hover:text-rose-500 font-medium transition-colors uppercase text-xs tracking-widest flex items-center gap-1">
               <User className="w-3 h-3" /> Admin
            </Link>
          </div>

          {/* Ícones Direita */}
          <div className="flex items-center gap-4">
            {/* CORRIGIDO: Agora aponta para /cart */}
            <Link to="/cart" className="relative group p-2">
              <ShoppingBag className="w-6 h-6 text-gray-700 group-hover:text-rose-500 transition-colors" />
              {cartCount > 0 && (
                <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-rose-500 rounded-full animate-bounce">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Menu Mobile */}
      {isMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 absolute w-full left-0 shadow-lg">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col items-center">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-rose-500 hover:bg-rose-50 rounded-md w-full text-center">Home</Link>
            <Link to="/rastrear" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-rose-500 hover:bg-rose-50 rounded-md w-full text-center">Rastrear Pedido</Link>
            
            {/* CORRIGIDO: Agora aponta para /cart */}
            <Link to="/cart" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-700 hover:text-rose-500 hover:bg-rose-50 rounded-md w-full text-center">Minha Sacola ({cartCount})</Link>
            
            <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-md w-full text-center">Área Admin</Link>
          </div>
        </div>
      )}
    </nav>
  );
}