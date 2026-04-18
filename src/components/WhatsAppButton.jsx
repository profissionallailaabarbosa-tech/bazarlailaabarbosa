import React, { useState, useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { db } from '../api/supabase';
import { resolveWhatsAppBase } from "../utils/whatsapp";

export default function WhatsAppButton() {
  const [link, setLink] = useState("");

  useEffect(() => {
    let active = true;

    async function loadWhats() {
      const settings = await db.settings.get();
      const source = settings.whatsapp_number || settings.whatsapp;
      if (active) {
        setLink(resolveWhatsAppBase(source));
      }
    }

    loadWhats();

    return () => {
      active = false;
    };
  }, []);

  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-24 right-4 z-50 rounded-full bg-[#25D366] p-3.5 text-white shadow-lg transition-all hover:scale-110 hover:bg-[#128C7E] sm:bottom-24 sm:right-5 md:bottom-6 md:right-6 md:p-4"
      title="Falar com a Laila"
      aria-label="Falar com a Laila no WhatsApp"
    >
      <MessageCircle className="h-7 w-7 md:h-8 md:w-8" />
    </a>
  );
}
