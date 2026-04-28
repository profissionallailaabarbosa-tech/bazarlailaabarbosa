import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ShoppingBag, User, Menu, X, Package } from "lucide-react";

export default function Navbar() {
  const [cartCount, setCartCount] = useState(0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const updateCount = () => {
      const savedCart = JSON.parse(localStorage.getItem("carrinho_laila") || "[]");
      setCartCount(savedCart.length);
    };

    updateCount();
    window.addEventListener("storage", updateCount);
    window.addEventListener("focus", updateCount);
    window.addEventListener("cart-updated", updateCount);

    return () => {
      window.removeEventListener("storage", updateCount);
      window.removeEventListener("focus", updateCount);
      window.removeEventListener("cart-updated", updateCount);
    };
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setIsMenuOpen(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!isMenuOpen) {
      document.body.style.overflow = "";
      return undefined;
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <nav className="sticky top-0 z-50 bg-white/70 backdrop-blur md:border-b md:border-gray-100 md:bg-white/95 md:shadow-sm">
      <div className="mx-auto max-w-[28rem] px-3 py-2 sm:max-w-7xl sm:px-6 sm:py-0 lg:px-8">
        <div className="flex h-16 items-center justify-between rounded-[1.7rem] border border-gray-100 bg-white/96 px-2 shadow-[0_12px_32px_rgba(15,23,42,0.08)] sm:h-20 sm:rounded-none sm:border-0 sm:bg-transparent sm:px-0 sm:shadow-none">
          <div className="flex items-center md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="-ml-2 rounded-full p-2.5 text-gray-500 transition hover:bg-rose-50 hover:text-rose-500"
              aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center md:justify-start">
            <Link
              to="/"
              className="text-[2rem] font-bold leading-none text-rose-500 transition-opacity hover:opacity-80 sm:text-3xl md:text-4xl"
              style={{ fontFamily: "'Great Vibes', cursive" }}
            >
              Laila Barbosa
            </Link>
          </div>

          <div className="hidden items-center space-x-8 md:flex">
            <Link to="/" className="text-xs font-medium uppercase tracking-widest text-gray-600 transition-colors hover:text-rose-500">Home</Link>
            <Link to="/#products-section" className="text-xs font-medium uppercase tracking-widest text-gray-600 transition-colors hover:text-rose-500">Produtos</Link>
            <Link to="/rastrear" className="flex items-center gap-1 text-xs font-medium uppercase tracking-widest text-gray-600 transition-colors hover:text-rose-500">
              <Package className="h-3 w-3" /> Meus pedidos
            </Link>
            <Link to="/admin" className="flex items-center gap-1 text-xs font-medium uppercase tracking-widest text-gray-400 transition-colors hover:text-rose-500">
              <User className="h-3 w-3" /> Admin
            </Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link to="/cart" className="group relative rounded-full p-2.5 transition hover:bg-rose-50">
              <ShoppingBag className="h-6 w-6 text-gray-700 transition-colors group-hover:text-rose-500" />
              {cartCount > 0 && (
                <span className="absolute right-0 top-0 inline-flex -translate-y-1/4 translate-x-1/4 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold leading-none text-white animate-bounce">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="absolute left-0 w-full px-3 pt-1 md:hidden">
          <div className="mx-auto max-w-[28rem] rounded-[1.8rem] border border-gray-100 bg-white/98 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
            <div className="flex flex-col items-center space-y-2">
              <Link to="/" onClick={() => setIsMenuOpen(false)} className="block w-full rounded-2xl px-4 py-3.5 text-center text-base font-medium text-gray-700 hover:bg-rose-50 hover:text-rose-500">Home</Link>
              <Link to="/#products-section" onClick={() => setIsMenuOpen(false)} className="block w-full rounded-2xl px-4 py-3.5 text-center text-base font-medium text-gray-700 hover:bg-rose-50 hover:text-rose-500">Produtos</Link>
              <Link to="/rastrear" onClick={() => setIsMenuOpen(false)} className="block w-full rounded-2xl px-4 py-3.5 text-center text-base font-medium text-gray-700 hover:bg-rose-50 hover:text-rose-500">Meus pedidos</Link>
              <Link to="/cart" onClick={() => setIsMenuOpen(false)} className="block w-full rounded-2xl px-4 py-3.5 text-center text-base font-medium text-gray-700 hover:bg-rose-50 hover:text-rose-500">Minha sacola ({cartCount})</Link>
              <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="block w-full rounded-2xl px-4 py-3.5 text-center text-base font-medium text-gray-400 hover:bg-rose-50 hover:text-rose-500">Área Admin</Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
