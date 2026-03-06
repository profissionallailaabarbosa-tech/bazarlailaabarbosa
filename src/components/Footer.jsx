import React, { useEffect, useState } from "react";
import { Instagram } from "lucide-react";
import { db } from "../api/supabase";

export default function Footer() {
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    async function load() {
      const settings = await db.settings.get();
      setWhatsapp(settings.whatsapp_number || settings.whatsapp || "5511999999999");
    }
    load();
  }, []);

  return (
    <footer className="bg-gray-900 text-white pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-3 gap-12">

        <div>
          <h2 className="text-3xl font-bold text-rose-500 mb-4">
            Laila Barbosa
          </h2>
          <p className="text-gray-400 text-sm">
            Moda sustentável, peças selecionadas com carinho e estilo único.
          </p>
        </div>

        <div>
          <h3 className="font-bold text-lg mb-4">Ajuda</h3>
          <ul className="space-y-3 text-gray-400 text-sm">
            <li>Como Comprar</li>
            <li>Envios</li>
            <li>Trocas</li>
          </ul>
        </div>

        <div>
          <h3 className="font-bold text-lg mb-4">Fale Conosco</h3>
          <a
            href={`https://wa.me/${whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex bg-green-500 p-3 rounded-full hover:scale-105 transition"
          >
            WhatsApp
          </a>
        </div>

      </div>

      <div className="border-t border-gray-800 mt-12 pt-6 text-center text-gray-500 text-xs">
        © {new Date().getFullYear()} Laila Barbosa
      </div>
    </footer>
  );
}
