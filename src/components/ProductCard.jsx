import React from "react";
import { Video } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ProductCard({ product }) {
  const { id, images, image, name, price, size, video, quantity } = product;
  const navigate = useNavigate();

  const isSoldOut = Number(quantity) <= 0;

  const fallbackImage = "/sem-imagem.png";
  const mainImage =
    (images && images.length > 0 && images[0]) ||
    image ||
    fallbackImage;

  return (
    <div
      onClick={() => navigate(`/produto/${id}`)}
      className={`group bg-white rounded-lg overflow-hidden border border-gray-100 flex flex-col h-full shadow-sm hover:shadow-md transition-shadow cursor-pointer ${
        isSoldOut ? "opacity-60 grayscale" : ""
      }`}
    >
      <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
        {video && mainImage ? (
          <video
            src={video}
            className="w-full h-full object-cover"
            muted
            autoPlay
            loop
            playsInline
            poster={mainImage}
          />
        ) : (
          <img
            src={mainImage}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        )}

        {video && !isSoldOut && (
          <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-sm p-1.5 rounded-full text-white">
            <Video className="w-3 h-3" />
          </div>
        )}

        {size && !isSoldOut && (
          <span className="absolute top-2 left-2 bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase rounded shadow-sm text-gray-800">
            {size}
          </span>
        )}

        {isSoldOut && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="bg-red-500 text-white font-black px-4 py-2 transform -rotate-12 border-2 border-white shadow-xl text-xs">
              ESGOTADO
            </span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col flex-grow">
        <h3 className="text-gray-600 font-medium text-xs md:text-sm line-clamp-2 mb-2 min-h-[2.5rem]">
          {name}
        </h3>
        <div className="mt-auto">
          <p className="text-rose-500 font-bold text-sm md:text-lg">
            R$ {price}
          </p>
        </div>
      </div>
    </div>
  );
}
