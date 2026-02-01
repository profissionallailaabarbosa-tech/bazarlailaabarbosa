import React, { useState, useEffect } from 'react';
import { db } from '../api/db';

export default function Banner() {
  const [customImage, setCustomImage] = useState(null);

  useEffect(() => {
    async function loadPhoto() {
      const settings = await db.settings.get();
      if (settings && settings.banner) {
        setCustomImage(settings.banner);
      }
    }
    loadPhoto();
  }, []);

  const scrollToProducts = () => {
    const element = document.getElementById('products-section');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollBy({ top: 600, behavior: 'smooth' });
    }
  };

  return (
    <section className="relative bg-[#f5e6e0] overflow-hidden min-h-[600px] flex items-center">
      
      {/* Elementos Decorativos (Setinhas) */}
      <div className="absolute top-1/2 left-4 -translate-y-1/2 hidden md:block text-gray-400/30 text-6xl font-light select-none">
        &lt;
      </div>
      <div className="absolute top-1/2 right-4 -translate-y-1/2 hidden md:block text-gray-400/30 text-6xl font-light select-none">
        &gt;
      </div>

      <div className="max-w-7xl mx-auto px-4 w-full flex flex-col md:flex-row items-center h-full pt-10 md:pt-0">
        
        {/* LADO ESQUERDO - TEXTO */}
        <div className="w-full md:w-5/12 relative z-10 flex flex-col items-start text-left mb-10 md:mb-0 pl-4 md:pl-12">
          
          <h1 className="text-6xl md:text-7xl font-bold text-rose-500 leading-[0.9] tracking-tight mb-6" style={{ fontFamily: "'Great Vibes', cursive" }}>
            Bazar <br/> LailaaBarbosa
          </h1>
          
          <div className="h-0.5 w-16 bg-gray-800 mb-6"></div>
          
          <p className="text-gray-600 text-sm md:text-base max-w-md mb-8 leading-relaxed font-light">
            Meu bazar nasceu para dar um novo destino às peças que fizeram parte da minha história e do meu conteúdo. 
            São roupas seminovas, escolhidas com carinho, cheias de estilo, qualidade e preço acessível. 
            Quero que cada peça encontre alguém que vai amar usar tanto quanto eu amei.
          </p>
          
          <button 
            onClick={scrollToProducts}
            className="bg-black text-white hover:bg-gray-800 px-10 py-6 text-sm tracking-widest font-medium transition-all hover:scale-105 shadow-lg"
          >
            SHOP NOW
          </button>
        </div>

        {/* LADO DIREITO - IMAGEM */}
        <div className="w-full md:w-7/12 h-full flex items-end justify-center md:justify-end relative">
          
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/20 rounded-full blur-3xl -z-10"></div>
          
          <img 
            src={customImage || "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69161ef96b2f271c750c4b16/5daccd8a8_capa.jpg"}
            alt="Capa da Loja"
            className="max-h-[400px] md:max-h-[650px] w-auto object-contain object-bottom drop-shadow-xl"
            onError={(e) => {
               e.target.src = "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=800";
            }}
          />
        </div>
      </div>
    </section>
  );
}