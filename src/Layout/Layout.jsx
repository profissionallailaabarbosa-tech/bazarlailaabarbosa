import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, ShoppingCart, Package, UserCircle } from "lucide-react";
import Navbar from "../components/Navbar";
import WhatsAppFloat from "../components/WhatsAppFloat";

export default function Layout({ children }) {
  const location = useLocation();

  // Itens do menu inferior (mobile) ou links rápidos
  const navItems = [
    { name: "Home", path: "/", icon: Home },
    { name: "Carrinho", path: "/cart", icon: ShoppingCart },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col font-['Inter']">
      {/* Barra de Navegação Superior */}
      <Navbar />

      {/* Conteúdo Principal */}
      <main className="flex-grow bg-white">
        {children}
      </main>

      {/* Botão Flutuante do WhatsApp */}
      <WhatsAppFloat />

      {/* Rodapé (Footer) idêntico ao original */}
      <footer className="bg-white border-t-4 border-rose-500 mt-20">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-center">
            
            {/* Lado Esquerdo - Instagram */}
            <div className="flex flex-col items-center md:items-start">
              <a 
                href="https://instagram.com/lailaabarbosa" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-400 to-rose-500 text-white px-6 py-3 rounded-full shadow-lg hover:scale-105 transition-all"
              >
                <span className="font-bold">@lailaabarbosa</span>
              </a>
            </div>

            {/* Centro - Info */}
            <div className="text-center space-y-3">
              <h3 className="brand-name text-3xl text-rose-500">Bazar Lailaa</h3>
              <p className="text-gray-700 font-medium">© 2026 Bazar LailaaBarbosa</p>
              <p className="text-gray-500 text-sm">Pagamento via Pix ou Cartão 💳</p>
            </div>

            {/* Lado Direito - Contato */}
            <div className="flex flex-col items-center md:items-end text-center md:text-right">
              <h4 className="font-semibold text-gray-800">Contato</h4>
              <p className="text-rose-500 text-sm font-medium">WhatsApp: (11) 99999-9999</p>
              <Link to="/policies" className="text-gray-400 underline text-xs mt-2">
                Políticas de Troca
              </Link>
            </div>

          </div>
        </div>
      </footer>
    </div>
  );
}