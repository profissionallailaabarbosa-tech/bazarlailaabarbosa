import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { db } from '../api/supabase';
import { resolveWhatsAppBase } from "../utils/whatsapp";

export default function WhatsAppButton() {
  const [link, setLink] = useState("https://wa.me/"); // Link padrão vazio

  useEffect(() => {
    async function loadWhats() {
      const settings = await db.settings.get();
      // Se tiver número salvo, cria o link. Se não, deixa um padrão.
      const source = settings.whatsapp_number || settings.whatsapp;
      setLink(resolveWhatsAppBase(source));
    }
    loadWhats();
  }, []);

  return (
    <a 
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 bg-[#25D366] text-white p-4 rounded-full shadow-lg hover:bg-[#128C7E] hover:scale-110 transition-all z-50 animate-bounce"
      title="Falar com a Laila"
    >
      <MessageCircle className="w-8 h-8" />
    </a>
  );
}
