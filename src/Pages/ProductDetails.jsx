import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { ArrowLeft, ShoppingBag, Truck, ShieldCheck, Minus, Plus, HeartHandshake, Sparkles, Video } from "lucide-react";
import { sanitizeMediaList, sanitizeMediaUrl } from "../utils/media";

export default function ProductDetails() {
  const MAX_STORY_VIDEO_COUNT = 3;
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(null);
  const touchStartXRef = useRef(null);
  const touchStartYRef = useRef(null);

  const getProductStoryVideos = (item) => {
    const storyVideos = Array.isArray(item?.story_videos)
      ?item.story_videos
      : [];

    const legacyVideo = typeof item?.video === "string" ?item.video.trim() : "";

    return sanitizeMediaList([...storyVideos, legacyVideo]).slice(0, MAX_STORY_VIDEO_COUNT);
  };

  useEffect(() => {
    let active = true;

    async function loadProduct() {
      try {
        const { data, error } = await supabase
          .from("products")
          .select("*")
          .eq("id", id)
          .single();

        if (error) throw error;

        if (data && active) {
          setProduct(data);
          setSelectedImage((currentImage) => {
            const safePrimaryImage = sanitizeMediaUrl(data.image);
            const availableImages = sanitizeMediaList([safePrimaryImage, ...(data.gallery || [])]);
            if (!currentImage) return safePrimaryImage;
            return availableImages.includes(currentImage) ?currentImage : safePrimaryImage;
          });
        }
      } catch (err) {
        console.error("Erro ao carregar:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProduct();

    const channel = supabase
      .channel(`product-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "products", filter: `id=eq.${id}` },
        () => loadProduct()
      )
      .subscribe();

    const intervalId = window.setInterval(() => {
      loadProduct();
    }, 10000);

    const handleWindowFocus = () => {
      loadProduct();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
      supabase.removeChannel(channel);
    };
  }, [id]);

  useEffect(() => {
    if (!product) return;

    const maxStock = parseInt(product.quantity, 10) || 0;
    if (maxStock <= 0) {
      setQuantity(1);
      return;
    }

    setQuantity((current) => Math.min(Math.max(current, 1), maxStock));
  }, [product]);

  const saveToCart = (items) => {
    try {
      localStorage.setItem("carrinho_laila", JSON.stringify(items));
      window.dispatchEvent(new Event("cart-updated"));
      return true;
    } catch (e) {
      console.error("Memória cheia:", e);
      alert("A memória do carrinho encheu. Vamos manter só o item mais recente.");
      localStorage.removeItem("carrinho_laila");
      localStorage.setItem("carrinho_laila", JSON.stringify([items[items.length - 1]]));
      window.dispatchEvent(new Event("cart-updated"));
      return true;
    }
  };

  const handleAddToCart = ({ redirectToCart = true } = {}) => {
    if (!product) return;

    const maxStock = parseInt(product.quantity, 10) || 0;
    if (maxStock <= 0) {
      alert("Esta peça esgotou.");
      return;
    }

    const cart = JSON.parse(localStorage.getItem("carrinho_laila") || "[]");
    const existingIndex = cart.findIndex((item) => item.id === product.id);

    if (existingIndex >= 0) {
      const currentQty = cart[existingIndex].quantitySelected || 1;
      cart[existingIndex].quantitySelected = Math.min(currentQty + quantity, maxStock);
    } else {
      cart.push({ ...product, quantitySelected: quantity });
    }

    if (saveToCart(cart)) {
      window.dispatchEvent(new Event("storage"));
      window.dispatchEvent(new Event("cart-updated"));
      if (redirectToCart) {
        navigate("/cart");
      }
    }
  };

  const handleBuyNow = () => {
    if (!product) return;
    handleAddToCart({ redirectToCart: false });
    window.location.assign("/checkout");
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-rose-500">Carregando...</div>;
  }

  if (!product) {
    return <div className="min-h-screen flex items-center justify-center">Produto não encontrado.</div>;
  }

  const allImages = sanitizeMediaList([product.image, ...(product.gallery || [])]);
  const storyVideos = getProductStoryVideos(product);
  const maxStock = parseInt(product.quantity, 10) || 0;
  const isSoldOut = maxStock <= 0;
  const stockMessage = isSoldOut ?"Sem estoque no momento" : "Peça disponível agora";
  const categoryLabel =
    {
      vestidos: "Vestidos",
      conjuntos: "Conjuntos",
      blusas: "Blusas",
      saias: "Saias",
      calcas: "Calças",
    }[product.category] || product.category || "Coleção";

  const goToPrevMedia = () => {
    if (allImages.length <= 1) return;
    const currentIndex = Math.max(0, allImages.indexOf(selectedImage));
    const nextIndex = currentIndex === 0 ? allImages.length - 1 : currentIndex - 1;
    setSelectedImage(allImages[nextIndex]);
  };

  const goToNextMedia = () => {
    if (allImages.length <= 1) return;
    const currentIndex = Math.max(0, allImages.indexOf(selectedImage));
    const nextIndex = currentIndex === allImages.length - 1 ? 0 : currentIndex + 1;
    setSelectedImage(allImages[nextIndex]);
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.changedTouches?.[0]?.clientX ?? null;
    touchStartYRef.current = event.changedTouches?.[0]?.clientY ?? null;
  };

  const handleTouchMove = (event) => {
    if (touchStartXRef.current === null || touchStartYRef.current === null) return;
    const moveX = event.changedTouches?.[0]?.clientX ?? null;
    const moveY = event.changedTouches?.[0]?.clientY ?? null;
    if (moveX === null || moveY === null) return;

    const deltaX = Math.abs(touchStartXRef.current - moveX);
    const deltaY = Math.abs(touchStartYRef.current - moveY);

    if (deltaX > deltaY && deltaX > 12) {
      event.preventDefault();
    }
  };

  const handleTouchEnd = (event) => {
    if (touchStartXRef.current === null) return;
    const endX = event.changedTouches?.[0]?.clientX ?? null;
    if (endX === null) return;
    const deltaX = touchStartXRef.current - endX;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (Math.abs(deltaX) < 45) return;
    if (deltaX > 0) goToNextMedia();
    if (deltaX < 0) goToPrevMedia();
  };

  const handleTouchCancel = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
  };

  const handleOpenStories = () => {
    if (!storyVideos.length) return;
    navigate(`/?story=${product.id}`);
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#fffaf7_100%)] pb-[calc(8.5rem+env(safe-area-inset-bottom))] pt-4 font-sans text-gray-700 md:pb-20">
      <div className="mx-auto max-w-[28rem] px-3 sm:max-w-6xl sm:px-4 lg:py-10">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 flex items-center font-medium text-gray-500 transition hover:text-rose-500"
        >
          <ArrowLeft className="mr-2" size={20} /> Voltar
        </button>

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          <div className="space-y-4">
            <div
              className="relative mx-auto aspect-square max-w-[430px] overflow-hidden rounded-[1.6rem] border border-[#efe3dc] bg-white shadow-[0_28px_60px_-42px_rgba(15,23,42,0.24)] sm:aspect-[4/5] lg:max-w-none lg:aspect-square lg:rounded-[1.9rem]"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchCancel}
              style={{ touchAction: "none" }}
            >
              <img
                src={selectedImage}
                alt={product.name}
                decoding="async"
                fetchPriority="high"
                className="h-full w-full animate-in object-cover fade-in duration-500"
              />
              {isSoldOut && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <span className="transform -rotate-12 rounded-full border-2 border-white bg-red-600 px-6 py-2 font-bold text-white shadow-lg">
                    ESGOTADO
                  </span>
                </div>
              )}
              {storyVideos.length > 0 && (
                <button
                  onClick={handleOpenStories}
                  className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm font-bold text-white backdrop-blur hover:bg-black/75"
                >
                  <Video size={16} /> {storyVideos.length > 1 ?"Ver nos stories" : "Ver no story"}
                </button>
              )}
            </div>

            {allImages.length > 1 && (
              <p className="mx-auto max-w-[430px] text-center text-[11px] uppercase tracking-[0.18em] text-gray-400 lg:max-w-none">
                Arraste para o lado para ver a próxima foto
              </p>
            )}

            {allImages.length > 1 && (
              <div className="custom-scrollbar mx-auto flex max-w-[430px] snap-x snap-mandatory gap-2 overflow-x-auto pb-2 sm:gap-3 lg:max-w-none">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(img)}
                    className={`h-16 w-16 flex-shrink-0 snap-start overflow-hidden rounded-2xl border-2 bg-white shadow-sm transition-all sm:h-20 sm:w-20 ${
                      selectedImage === img
                        ?"border-rose-500 ring-2 ring-rose-100"
                        : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                  >
                    <img src={img} alt={`${product.name} ${idx + 1}`} loading="lazy" decoding="async" sizes="80px" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6 lg:pl-10">
            <div className="rounded-[2rem] border border-rose-100 bg-gradient-to-b from-white via-rose-50/40 to-white p-5 shadow-[0_24px_60px_-40px_rgba(244,63,94,0.45)] sm:p-6 lg:p-8">
              <p className="text-[11px] uppercase tracking-[0.24em] text-rose-300">Peça da curadoria</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-600">
                  {categoryLabel}
                </span>
                {product.featured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                    <Sparkles size={12} /> destaque
                  </span>
                )}
                {storyVideos.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-black px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                    <Video size={12} /> {storyVideos.length > 1 ?`${storyVideos.length} vídeos` : "com vídeo"}
                  </span>
                )}
              </div>

              <h1 className="mt-4 text-[1.9rem] font-bold capitalize leading-tight text-gray-900 sm:text-3xl lg:text-[2.6rem]">
                {product.name}
              </h1>

              <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p
                    className="text-xl leading-none text-rose-400"
                    style={{ fontFamily: "'Great Vibes', cursive" }}
                  >
                    selecionada para você
                  </p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 lg:text-4xl">
                    R$ {product.price.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    Pagamento seguro por PIX ou cartão, com confirmação real do pedido
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-gray-400">
                    Pedido numerado + confirmação antes do WhatsApp
                  </p>
                </div>

                <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm ${isSoldOut ?"border-red-200 bg-red-50 text-red-600" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  {stockMessage}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/70 bg-white/95 p-4 shadow-sm">
                <p className="text-sm leading-relaxed text-gray-600">
                  {product.description || "Peça exclusiva selecionada com carinho para você."}
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">
                    Tamanho
                  </span>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="inline-flex h-12 min-w-12 items-center justify-center rounded-xl border-2 border-gray-900 px-4 text-sm font-black text-gray-900 shadow-sm">
                      {product.size || "UN"}
                    </span>
                    <p className="text-sm text-gray-500">
                      Confira o tamanho antes de finalizar a compra.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:min-w-[190px]">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-gray-400">
                    Quantidade
                  </span>
                  <div className="mt-3 flex h-12 items-center rounded-xl border border-gray-200 bg-gray-50">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={isSoldOut || quantity <= 1}
                      className="h-full px-4 text-gray-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="flex-1 text-center font-bold text-gray-700">{quantity}</span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(maxStock, q + 1))}
                      disabled={isSoldOut || quantity >= maxStock}
                      className="h-full px-4 text-gray-400 hover:text-rose-500 disabled:opacity-30"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-6 hidden flex-col gap-3 md:flex">
                <button
                  onClick={handleBuyNow}
                  disabled={isSoldOut}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-4 text-lg font-bold text-white shadow-lg shadow-rose-200 transition-all hover:bg-rose-600 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Comprar Agora
                </button>

                <button
                  onClick={handleAddToCart}
                  disabled={isSoldOut}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-gray-200 bg-white py-4 font-bold text-gray-700 transition-all hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShoppingBag size={20} /> Adicionar à Sacola
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                  <div className="flex items-center gap-2 font-semibold text-gray-800">
                    <Truck size={16} className="text-rose-500" />
                    Envio flexível
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    Correios, retirada ou envio por Uber conforme sua preferência.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                  <div className="flex items-center gap-2 font-semibold text-gray-800">
                    <ShieldCheck size={16} className="text-rose-500" />
                    Compra segura
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    Seu pedido fica registrado e o pagamento passa por confirmação segura.
                  </p>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm">
                  <div className="flex items-center gap-2 font-semibold text-gray-800">
                    <HeartHandshake size={16} className="text-rose-500" />
                    Atendimento próximo
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-gray-500">
                    Se precisar, você consegue alinhar detalhes da entrega direto com a loja.
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-xs leading-relaxed text-rose-700">
                Depois da aprovação, você recebe a confirmação do pedido e segue para o WhatsApp da loja com o número do pedido em destaque para alinhar a entrega.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rose-100 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400">Peça selecionada</p>
            <p className="text-lg font-bold text-gray-900">R$ {product.price.toFixed(2)}</p>
          </div>
          <button
            onClick={handleBuyNow}
            disabled={isSoldOut}
            className="flex-1 rounded-2xl bg-rose-500 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Comprar agora
          </button>
        </div>
      </div>
    </div>
  );
}


