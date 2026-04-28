import React, { useMemo, useState } from "react";
import { Video, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { sanitizeMediaUrl } from "../utils/media";

export default function ProductCard({ product }) {
  const { id, images, image, name, price, size, video, quantity, featured, category } = product;
  const navigate = useNavigate();
  const categoryLabel =
    {
      vestidos: "Vestidos",
      conjuntos: "Conjuntos",
      blusas: "Blusas",
      saias: "Saias",
      calcas: "Calças",
    }[category] || category || "Coleção";

  const stock = Number(quantity || 0);
  const isSoldOut = stock <= 0;

  const mainImage = useMemo(() => {
    const galleryImage = Array.isArray(images) ? images.find((value) => sanitizeMediaUrl(value)) : "";
    return sanitizeMediaUrl(galleryImage) || sanitizeMediaUrl(image) || "";
  }, [images, image]);

  const hasVideo = Boolean(sanitizeMediaUrl(video));
  const [failedSources, setFailedSources] = useState({});
  const imageFailed = !mainImage || Boolean(failedSources[mainImage]);

  return (
    <div
      onClick={() => navigate(`/produto/${id}`)}
      className={`group flex h-full cursor-pointer flex-col overflow-hidden rounded-[24px] border border-[#eadfd7] bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-[0_18px_40px_rgba(15,23,42,0.10)] ${
        isSoldOut ? "opacity-60 grayscale" : ""
      }`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-gray-100">
        {imageFailed ? (
          <div className="flex h-full w-full flex-col items-center justify-center bg-[linear-gradient(180deg,#fff8f5_0%,#f6ece6_100%)] px-6 text-center">
            <span
              className="text-3xl text-rose-300"
              style={{ fontFamily: "'Great Vibes', cursive" }}
            >
              Laila Barbosa
            </span>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-gray-500">
              imagem indisponível
            </p>
          </div>
        ) : (
          <img
            src={mainImage}
            alt={name}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 22vw"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            onError={() => {
              setFailedSources((current) => ({ ...current, [mainImage]: true }));
            }}
          />
        )}

        {hasVideo && !isSoldOut && (
          <div className="absolute right-3 top-3 flex items-center justify-between rounded-full bg-black/55 px-3 py-2 text-white backdrop-blur-sm">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Tem vídeo</span>
            <Video className="h-3.5 w-3.5" />
          </div>
        )}

        {size && !isSoldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-800 shadow-sm">
            {size}
          </span>
        )}

        {featured && !isSoldOut && (
          <span className="absolute left-3 top-10 rounded-full bg-rose-500 px-2.5 py-1 text-[10px] font-bold uppercase text-white shadow-sm">
            Destaque
          </span>
        )}

        {!isSoldOut && (
          <div className="absolute inset-x-3 bottom-4 translate-y-0 opacity-100 transition-all duration-300 md:inset-x-4 md:bottom-4 md:translate-y-4 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100">
            <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/92 px-4 py-2 shadow-lg backdrop-blur-sm">
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-700">
                Ver e comprar
              </span>
              <ArrowUpRight size={16} className="text-rose-500" />
            </div>
          </div>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <span className="transform -rotate-12 border-2 border-white bg-red-500 px-4 py-2 text-xs font-black text-white shadow-xl">
              ESGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-grow flex-col bg-gradient-to-b from-white to-[#fffaf7] p-4 md:p-5">
        <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-gray-400">{categoryLabel}</p>
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-800 md:text-base">{name}</h3>
        <div className="mt-2 min-h-[1.5rem]">
          {!isSoldOut && (
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">peça única selecionada</p>
          )}
        </div>
        <div className="mt-auto">
          <div className="flex items-end justify-between gap-3">
            <p className="text-lg font-bold leading-none text-rose-500 md:text-2xl">R$ {price}</p>
            {!isSoldOut && (
              <span className="text-[10px] uppercase tracking-[0.18em] text-gray-400">pronta para checkout</span>
            )}
          </div>
          {!isSoldOut && (
            <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
              Peça única, com estoque real e envio combinado.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
