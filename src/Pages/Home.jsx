import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Volume2, VolumeX, ChevronLeft, ChevronRight, Video } from "lucide-react";
import { supabase } from "../api/supabase";
import ProductCard from "../components/ProductCard";
import { useNavigate } from "react-router-dom";
import { sanitizeMediaList, sanitizeMediaUrl } from "../utils/media";

export default function Home() {
  const navigate = useNavigate();
  const MAX_STORY_VIDEO_COUNT = 3;
  const categoryLabels = {
    vestidos: "Vestidos",
    conjuntos: "Conjuntos",
    blusas: "Blusas",
    saias: "Saias",
    calcas: "Calças",
  };
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [activeStoryIndex, setActiveStoryIndex] = useState(null);
  const [activeStoryClipIndex, setActiveStoryClipIndex] = useState(0);
  const [isStoryMuted, setIsStoryMuted] = useState(true);
  const [storyProgress, setStoryProgress] = useState(0);
  const [storyVideoVisible, setStoryVideoVisible] = useState(false);
  const storyVideoRef = useRef(null);

  const defaultBanner =
    "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69161ef96b2f271c750c4b16/5daccd8a8_capa.jpg";
  const [bannerImage, setBannerImage] = useState(defaultBanner);

  const categories = [
    { value: "all", label: "Todos" },
    { value: "vestidos", label: "Vestidos" },
    { value: "conjuntos", label: "Conjuntos" },
    { value: "blusas", label: "Blusas" },
    { value: "saias", label: "Saias" },
    { value: "calcas", label: "Calças" },
  ];

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*")
          .order("id", { ascending: false });

        if (productsError) {
          console.error("Erro ao buscar produtos:", productsError);
        } else if (active) {
          setProducts(productsData || []);
        }

        const { data: config } = await supabase.from("settings").select("banner_image_url").single();

        if (active && config && config.banner_image_url) {
          setBannerImage(config.banner_image_url);
        }
      } catch (error) {
        console.error("Erro geral:", error);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    const productsChannel = supabase
      .channel("home-products")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => loadData())
      .subscribe();

    const settingsChannel = supabase
      .channel("home-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "settings" }, () => loadData())
      .subscribe();

    const intervalId = window.setInterval(() => {
      loadData();
    }, 15000);

    const handleWindowFocus = () => {
      loadData();
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleWindowFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleWindowFocus);
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, []);

  const normalizeText = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const getProductStoryVideos = (product) => {
    const storyVideos = Array.isArray(product?.story_videos)
      ?product.story_videos
      : [];

    const legacyVideo = typeof product?.video === "string" ?product.video.trim() : "";

    return sanitizeMediaList([...storyVideos, legacyVideo]).slice(0, MAX_STORY_VIDEO_COUNT);
  };

  const getProductCoverImage = (product) =>
    sanitizeMediaUrl((product?.gallery || []).find((url) => sanitizeMediaUrl(url))) ||
    sanitizeMediaUrl(product?.image) ||
    "/sem-imagem.png";

  const filteredProducts = products.filter((product) => {
    const categoryMatch =
      selectedCategory === "all" || normalizeText(product.category).includes(normalizeText(selectedCategory));
    const searchValue = normalizeText(searchQuery);
    const searchMatch = searchValue === "" || normalizeText(product.name).includes(searchValue);
    const stock = Number(product.quantity || 0);
    const stockMatch =
      stockFilter === "all" ||
      (stockFilter === "available" && stock > 0) ||
      (stockFilter === "featured" && !!product.featured) ||
      (stockFilter === "sold_out" && stock <= 0);

    return categoryMatch && searchMatch && stockMatch;
  });

  const featuredProducts = filteredProducts.filter(
    (product) => product.featured && Number(product.quantity || 0) > 0
  );
  const regularProducts = filteredProducts.filter((product) => !product.featured);
  const displayProducts = stockFilter === "featured" ?featuredProducts : regularProducts;
  const availableCount = products.filter((product) => Number(product.quantity || 0) > 0).length;
  const storiesProducts = useMemo(
    () => products.filter((product) => getProductStoryVideos(product).length > 0 && Number(product.quantity || 0) > 0),
    [products]
  );
  const activeStory = activeStoryIndex !== null ?storiesProducts[activeStoryIndex] : null;
  const activeStoryVideos = activeStory ?getProductStoryVideos(activeStory) : [];
  const activeStoryVideo = activeStoryVideos[activeStoryClipIndex] || "";

  const scrollToProducts = () => {
    const element = document.getElementById("products-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const openStory = (index) => {
    setActiveStoryIndex(index);
    setActiveStoryClipIndex(0);
    setIsStoryMuted(true);
    setStoryProgress(0);
    setStoryVideoVisible(false);
  };

  const closeStory = () => {
    setActiveStoryIndex(null);
    setActiveStoryClipIndex(0);
    setIsStoryMuted(true);
    setStoryProgress(0);
    setStoryVideoVisible(false);
  };

  const openProductFromStory = () => {
    if (!activeStory) return;
    closeStory();
    navigate(`/produto/${activeStory.id}`);
  };

  const goToPrevStory = () => {
    if (!storiesProducts.length) return;
    if (activeStory && activeStoryClipIndex > 0) {
      setActiveStoryClipIndex((current) => Math.max(0, current - 1));
      setIsStoryMuted(true);
      setStoryProgress(0);
      setStoryVideoVisible(false);
      return;
    }
    setActiveStoryIndex((current) => {
      if (current === null) return 0;
      return current === 0 ?storiesProducts.length - 1 : current - 1;
    });
    setActiveStoryClipIndex(() => {
      if (!storiesProducts.length) return 0;
      const prevIndex = activeStoryIndex === null ?0 : activeStoryIndex === 0 ?storiesProducts.length - 1 : activeStoryIndex - 1;
      const prevStory = storiesProducts[prevIndex];
      const prevVideos = getProductStoryVideos(prevStory);
      return Math.max(0, prevVideos.length - 1);
    });
    setIsStoryMuted(true);
    setStoryProgress(0);
    setStoryVideoVisible(false);
  };

  const goToNextStory = () => {
    if (!storiesProducts.length) return;
    if (activeStory && activeStoryClipIndex < activeStoryVideos.length - 1) {
      setActiveStoryClipIndex((current) => current + 1);
      setIsStoryMuted(true);
      setStoryProgress(0);
      setStoryVideoVisible(false);
      return;
    }
    setActiveStoryIndex((current) => {
      if (current === null) return 0;
      return current === storiesProducts.length - 1 ?0 : current + 1;
    });
    setActiveStoryClipIndex(0);
    setIsStoryMuted(true);
    setStoryProgress(0);
    setStoryVideoVisible(false);
  };

  useEffect(() => {
    setStoryProgress(0);
    setStoryVideoVisible(false);
  }, [activeStoryIndex, activeStoryClipIndex]);

  const handleStoryTimeUpdate = () => {
    const video = storyVideoRef.current;
    if (!video || !video.duration) return;
    setStoryProgress(Math.min(100, (video.currentTime / video.duration) * 100));
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      <section className="relative flex min-h-[520px] items-center overflow-hidden bg-[#f5e6e0] md:min-h-[620px]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.58),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.08),transparent_28%)]" />
        <div className="absolute left-4 top-1/2 hidden -translate-y-1/2 select-none text-6xl font-light text-gray-400/30 md:block">
          &lt;
        </div>
        <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 select-none text-6xl font-light text-gray-400/30 md:block">
          &gt;
        </div>

        <div className="mx-auto flex h-full w-full max-w-7xl flex-col items-center px-4 pt-8 md:flex-row md:pt-0">
          <div className="relative z-10 mb-8 flex w-full flex-col items-start pl-1 text-left sm:pl-4 md:mb-0 md:w-5/12 md:pl-12">
            <div className="mb-4 inline-flex items-center rounded-full border border-white/60 bg-white/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-gray-600 shadow-sm backdrop-blur-sm">
              Curadoria autoral
            </div>
            <h1
              className="mb-5 text-4xl leading-[0.92] tracking-tight text-rose-500 sm:text-5xl md:text-[7.25rem]"
              style={{ fontFamily: "'Great Vibes', cursive", fontWeight: "400" }}
            >
              Bazar <br />
              <span className="ml-5 sm:ml-8">LailaaBarbosa</span>
            </h1>

            <div className="mb-6 h-0.5 w-16 bg-gray-800"></div>

            <p className="mb-3 max-w-md text-sm font-light leading-relaxed text-gray-600 sm:text-base">
              Peças autorais, seminovas e selecionadas com carinho para quem quer comprar bonito, rápido e com
              segurança.
            </p>
            <p className="mb-7 max-w-md text-sm leading-relaxed text-gray-500 sm:text-[15px]">
              Tudo fotografado com cuidado, com estoque real, vídeos nas peças principais e envio combinado com
              clareza.
            </p>

            <button
              onClick={scrollToProducts}
              className="w-full rounded-full bg-black px-8 py-4 text-sm font-medium tracking-[0.24em] text-white shadow-xl transition-all hover:scale-[1.02] hover:bg-gray-800 sm:w-auto sm:px-10 sm:py-5"
            >
              VER PEÇAS AGORA
            </button>
          </div>

          <div className="relative flex h-full w-full items-end justify-center md:w-7/12 md:justify-end">
            <div className="absolute bottom-0 right-0 -z-10 h-[500px] w-[500px] rounded-full bg-white/20 blur-3xl"></div>
            <img
              src={bannerImage}
              alt="Capa da Loja"
              fetchPriority="high"
              loading="eager"
              decoding="async"
              className="max-h-[360px] w-auto rounded-b-3xl object-contain object-bottom drop-shadow-xl sm:max-h-[430px] md:max-h-[650px]"
            />
          </div>
        </div>
      </section>

      <section id="products-section" className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.6rem] border border-rose-100 bg-[#fff7f4] p-5 shadow-[0_12px_34px_rgba(244,63,94,0.06)]">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-rose-300">Curadoria</p>
            <p className="text-sm leading-relaxed text-gray-700">
              Peças selecionadas, seminovas e com estoque real para uma compra mais segura e clara.
            </p>
          </div>
          <div className="rounded-[1.6rem] border border-gray-100 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gray-400">Disponíveis</p>
            <p className="text-2xl font-bold text-gray-800">{availableCount}</p>
            <p className="text-sm text-gray-500">peças prontas para compra</p>
          </div>
          <div className="rounded-[1.6rem] border border-gray-100 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gray-400">Stories</p>
            <p className="text-2xl font-bold text-gray-800">{storiesProducts.length}</p>
            <p className="text-sm text-gray-500">peças com vídeo para ver em movimento</p>
          </div>
        </div>

        <div className="relative mx-auto max-w-2xl">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome da peça..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-full border-2 border-gray-200 bg-white py-4 pl-12 text-lg shadow-[0_12px_34px_rgba(15,23,42,0.04)] focus:border-rose-500 focus:outline-none"
          />
        </div>
      </section>

      {storiesProducts.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-6">
          <div className="overflow-hidden rounded-[2rem] border border-rose-100 bg-gradient-to-br from-[#fff7f4] via-white to-[#fff1f5] shadow-[0_20px_70px_rgba(244,63,94,0.09)]">
            <div className="grid gap-6 px-5 py-6 md:grid-cols-[1.05fr_2fr] md:px-7 md:py-8">
              <div className="flex flex-col justify-between">
                <div>
                  <div className="mb-3 inline-flex items-center rounded-full bg-rose-500 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white shadow-sm">
                    Diferencial da loja
                  </div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-rose-300">Stories da vitrine</p>
                  <h2 className="text-2xl font-bold leading-tight text-gray-900 md:text-3xl">
                    Veja as peças em movimento antes de comprar
                  </h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-600">
                    Stories curtos, com a mesma energia do Instagram, para a cliente sentir caimento, tecido e estilo
                    sem sair da vitrine.
                  </p>
                  <p className="mt-3 max-w-md text-[13px] leading-relaxed text-gray-500">
                    Abra, veja os detalhes e toque direto na peça quando ela combinar com o seu momento.
                  </p>
                </div>

                <div className="mt-5 grid gap-2 text-xs text-gray-500 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
                  <span className="rounded-full border border-rose-100 bg-white px-3 py-2 text-center shadow-sm">
                    Toque para assistir
                  </span>
                  <span className="rounded-full border border-rose-100 bg-white px-3 py-2 text-center shadow-sm">
                    Som opcional
                  </span>
                  <span className="rounded-full border border-rose-100 bg-white px-3 py-2 text-center shadow-sm">
                    Abre a peça direto
                  </span>
                </div>
              </div>

              <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                {storiesProducts.map((product, index) => {
                  const cover = getProductCoverImage(product);
                  return (
                    <button
                      key={product.id}
                      onClick={() => openStory(index)}
                      className="min-w-[118px] max-w-[118px] text-left transition-transform hover:-translate-y-1.5"
                    >
                      <div className="rounded-[36px] bg-[linear-gradient(180deg,#fb7185_0%,#f43f5e_45%,#f59e0b_100%)] p-[2px] shadow-[0_14px_28px_rgba(244,63,94,0.18)]">
                        <div className="relative overflow-hidden rounded-[34px] bg-white p-1.5">
                          <div className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
                            Story
                          </div>
                          <div className="aspect-[9/16] overflow-hidden rounded-[29px] bg-gray-100">
                            <img
                              src={cover}
                              alt={product.name}
                              className="h-full w-full object-cover"
                              loading="lazy"
                              decoding="async"
                              sizes="116px"
                            />
                          </div>
                          <div className="absolute bottom-4 right-4 rounded-full bg-black/55 p-2 text-white backdrop-blur-sm">
                            <Video className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs font-semibold text-gray-700">{product.name}</p>
                      <p className="mt-1 text-[11px] text-gray-400">toque para assistir</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="mb-10 flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:justify-center md:overflow-visible">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-medium ${
                selectedCategory === cat.value ?"bg-rose-500 text-white" : "bg-gray-100 text-gray-600"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-2 md:flex-wrap md:justify-center md:overflow-visible">
          {[
            { value: "all", label: "Tudo" },
            { value: "available", label: "Disponíveis" },
            { value: "featured", label: "Destaques" },
            { value: "sold_out", label: "Esgotados" },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setStockFilter(filter.value)}
              className={`whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-bold tracking-wide transition ${
                stockFilter === filter.value ?"bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {loading ?(
          <div className="py-20 text-center">Carregando...</div>
        ) : filteredProducts.length === 0 ?(
          <div className="rounded-3xl border border-gray-100 bg-gray-50 px-6 py-16 text-center">
            <p className="mb-3 text-sm uppercase tracking-[0.25em] text-gray-400">Nada por aqui</p>
            <h2 className="mb-2 text-2xl font-bold text-gray-800">Nenhuma peça encontrada nesse filtro.</h2>
            <p className="text-gray-500">Tente outra categoria ou volte para ver todas as peças.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {featuredProducts.length > 0 && stockFilter !== "sold_out" && (
              <div>
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-rose-400">Seleção da loja</p>
                    <h2 className="text-2xl font-bold text-gray-900">Peças em destaque</h2>
                  </div>
                  <p className="text-sm text-gray-400">as mais desejadas da seleção atual</p>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                  {featuredProducts.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-gray-400">Catálogo</p>
                  <h2 className="text-2xl font-bold text-gray-900">Todas as peças</h2>
                </div>
                <p className="text-sm text-gray-400">{filteredProducts.length} peças encontradas</p>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:gap-6 md:grid-cols-3 lg:grid-cols-4">
                {displayProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {activeStory && (
        <div className="fixed inset-0 z-[70] bg-black/90 px-4 py-4 text-white backdrop-blur-sm">
          <div className="mx-auto flex h-full w-full max-w-md flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.22em] text-white/60">Story da peça</p>
                <p className="truncate text-sm font-semibold">{activeStory.name}</p>
              </div>
              <button onClick={closeStory} className="rounded-full bg-white/10 p-2 text-white/90 hover:bg-white/20">
                <X size={18} />
              </button>
            </div>

            <div className="relative flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black shadow-2xl">
              <div className="absolute inset-x-0 top-0 z-10 flex gap-1 p-3">
                {storiesProducts.map((story, index) => (
                  <div key={story.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear"
                      style={{
                        width:
                          index < activeStoryIndex
                            ?"100%"
                            : index === activeStoryIndex
                              ?`${storyProgress}%`
                              : "0%",
                      }}
                    />
                  </div>
                ))}
              </div>

              <video
                key={`${activeStory.id}-${activeStoryClipIndex}`}
                ref={storyVideoRef}
                src={activeStoryVideo}
                className={`h-full w-full object-cover transition-opacity duration-300 ${storyVideoVisible ?"opacity-100" : "opacity-0"}`}
                autoPlay
                playsInline
                preload="metadata"
                muted={isStoryMuted}
                onEnded={goToNextStory}
                onTimeUpdate={handleStoryTimeUpdate}
                onLoadedData={() => setStoryVideoVisible(true)}
                poster={
                  activeStoryClipIndex === 0
                    ?getProductCoverImage(activeStory)
                    : undefined
                }
              />

              <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 pt-8">
                <button onClick={goToPrevStory} className="rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/50">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={() => setIsStoryMuted((prev) => !prev)} className="rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/50">
                  {isStoryMuted ?<VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button onClick={goToNextStory} className="rounded-full bg-black/35 p-2 text-white backdrop-blur hover:bg-black/50">
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-white/65">{categoryLabels[activeStory.category] || activeStory.category || "Coleção"}</p>
                {activeStoryVideos.length > 1 && (
                  <p className="mt-2 text-[11px] uppercase tracking-[0.22em] text-white/60">
                    Story {activeStoryClipIndex + 1} de {activeStoryVideos.length}
                  </p>
                )}
                <h3 className="mt-2 text-2xl font-bold leading-tight">{activeStory.name}</h3>
                <p className="mt-2 text-lg font-semibold text-rose-200">R$ {Number(activeStory.price || 0).toFixed(2)}</p>
                <div className="mt-4 flex gap-3">
                  <button onClick={openProductFromStory} className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-bold text-gray-900 hover:bg-rose-50">
                    Ver peça
                  </button>
                  <button onClick={goToNextStory} className="rounded-full border border-white/20 px-4 py-3 text-sm font-bold text-white hover:bg-white/10">
                    Próximo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
