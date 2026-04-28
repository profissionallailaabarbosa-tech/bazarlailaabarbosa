import React, { useEffect, useState } from "react";
import { Instagram, MessageCircle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "../api/supabase";
import { resolveWhatsAppBase } from "../utils/whatsapp";

export default function Footer() {
  const [whatsapp, setWhatsapp] = useState("");

  useEffect(() => {
    async function load() {
      const settings = await db.settings.get();
      const source = settings.whatsapp_number || settings.whatsapp;
      setWhatsapp(resolveWhatsAppBase(source));
    }
    load();
  }, []);

  return (
    <footer className="border-t border-white/10 bg-[#111827] pb-8 pt-14 text-white sm:pt-16">
      <div className="mx-auto grid max-w-[28rem] gap-10 px-3 sm:max-w-7xl sm:px-4 md:grid-cols-3 md:gap-12 md:items-start">
        <div>
          <h2 className="brand-name mb-3 text-[2.8rem] leading-none text-rose-300 sm:text-5xl md:text-6xl">
            Laila Barbosa
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-rose-100/80">
            Moda com personalidade, peças selecionadas com carinho e um bazar pensado para compra rápida e segura.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-rose-200/20 bg-white/5 px-4 py-2 text-[11px] uppercase tracking-[0.25em] text-rose-200/80">
            Curadoria autoral
          </div>
        </div>

        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Ajuda</h3>
          <ul className="space-y-3 text-sm text-gray-300">
            <li>
              <Link to="/ajuda/como-comprar" className="flex items-center gap-2 transition hover:text-white">
                <ChevronRight size={14} className="text-rose-300" /> Como comprar
              </Link>
            </li>
            <li>
              <Link to="/ajuda/envios" className="flex items-center gap-2 transition hover:text-white">
                <ChevronRight size={14} className="text-rose-300" /> Envios
              </Link>
            </li>
            <li>
              <Link to="/ajuda/trocas" className="flex items-center gap-2 transition hover:text-white">
                <ChevronRight size={14} className="text-rose-300" /> Trocas
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-lg font-bold text-white">Fale Conosco</h3>
          <div className="space-y-3">
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-green-500 px-5 py-3 font-bold text-white shadow-lg shadow-green-500/20 transition hover:scale-[1.02] sm:w-auto"
              >
                <MessageCircle size={18} />
                WhatsApp
              </a>
            )}

            {!whatsapp && (
              <div className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-700 sm:w-auto">
                WhatsApp temporariamente indisponível
              </div>
            )}

            <a
              href="https://instagram.com/lailaabarbosa"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-gray-300 transition hover:text-white"
            >
              <Instagram size={16} className="text-rose-300" />
              @lailaabarbosa
            </a>
          </div>
        </div>
      </div>

      <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-gray-400 sm:mt-12">
        © {new Date().getFullYear()} Laila Barbosa
      </div>
    </footer>
  );
}
