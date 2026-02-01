import React, { useEffect, useState } from "react";
import { Search, Filter, ShoppingBag } from "lucide-react";
import { supabase } from "../api/supabase"; 
import { useNavigate } from "react-router-dom"; 

export default function Home() {
  const navigate = useNavigate(); 
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  
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
    { value: "acessorios", label: "Acessórios" }
  ];

  useEffect(() => {
    async function loadData() {
      try {
        // PRODUTOS
        const { data: productsData, error: productsError } = await supabase
          .from("products")
          .select("*");

        if (productsError) {
          console.error("Erro ao buscar produtos:", productsError);
        } else {
          setProducts(productsData || []);
        }

        // BANNER
        const { data: config } = await supabase
          .from("settings")
          .select("banner_image_url")
          .single();

        if (config && config.banner_image_url) {
          setBannerImage(config.banner_image_url);
        }
      } catch (error) {
        console.error("Erro geral:", error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filteredProducts = products.filter((p) => {
    const catProduto = p.category ? p.category.toLowerCase() : "";
    const catSelecionada = selectedCategory.toLowerCase();
    const categoryMatch =
      selectedCategory === "all" || catProduto.includes(catSelecionada);
    const searchMatch =
      searchQuery === "" ||
      (p.name && p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    return categoryMatch && searchMatch;
  });

  const handleBuy = (product) => {
    navigate(`/produto/${product.id}`);
  };

  const scrollToProducts = () => {
    const element = document.getElementById("products-section");
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* 1. BANNER */}
      <section className="relative bg-[#f5e6e0] overflow-hidden min-h-[600px] flex items-center">
        <div className="absolute top-1/2 left-4 -translate-y-1/2 hidden md:block text-gray-400/30 text-6xl font-light select-none">
          &lt;
        </div>
        <div className="absolute top-1/2 right-4 -translate-y-1/2 hidden md:block text-gray-400/30 text-6xl font-light select-none">
          &gt;
        </div>

        <div className="max-w-7xl mx-auto px-4 w-full flex flex-col md:flex-row items-center h-full pt-10 md:pt-0">
          <div className="w-full md:w-5/12 relative z-10 flex flex-col items-start text-left mb-10 md:mb-0 pl-4 md:pl-12">
            <h1
              className="text-5xl md:text-8xl text-rose-500 leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "'Great Vibes', cursive", fontWeight: "400" }}
            >
              Bazar <br />
              <span className="ml-8">LailaaBarbosa</span>
            </h1>

            <div className="h-0.5 w-16 bg-gray-800 mb-6"></div>

            <p className="text-gray-600 text-sm md:text-base max-w-md mb-8 leading-relaxed font-light">
              Meu bazar nasceu para dar um novo destino às peças que fizeram parte
              da minha história e do meu conteúdo. São roupas seminovas,
              escolhidas com carinho, cheias de estilo, qualidade e preço
              acessível.
            </p>

            <button
              onClick={scrollToProducts}
              className="bg-black text-white hover:bg-gray-800 px-10 py-6 text-sm tracking-widest font-medium transition-all hover:scale-105 shadow-xl"
            >
              SHOP NOW
            </button>
          </div>

          <div className="w-full md:w-7/12 h-full flex items-end justify-center md:justify-end relative">
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-white/20 rounded-full blur-3xl -z-10"></div>
            <img
              src={bannerImage}
              alt="Capa da Loja"
              className="max-h-[500px] md:max-h-[650px] w-auto object-contain object-bottom drop-shadow-xl rounded-b-3xl"
            />
          </div>
        </div>
      </section>

      {/* 2. PESQUISA */}
      <section id="products-section" className="max-w-7xl mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar produtos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 py-4 text-lg rounded-full border-2 border-gray-200 focus:border-rose-500 focus:outline-none"
          />
        </div>
      </section>

      {/* 3. FILTROS */}
      <section className="max-w-7xl mx-auto px-4 pb-12">
        <div className="flex flex-wrap justify-center gap-2 mb-10">
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-6 py-2 rounded-full text-sm font-medium ${
                selectedCategory === cat.value
                  ? "bg-rose-500 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* 4. PRODUTOS */}
        {loading ? (
          <div className="text-center py-20">Carregando...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredProducts.map((product) => {
              const isEsgotado =
                !product.quantity || product.quantity <= 0;

              return (
                <div
                  key={product.id}
                  onClick={() => handleBuy(product)}
                  className="bg-white rounded-xl border cursor-pointer"
                >
                  <div className="aspect-[3/4] bg-gray-100">
                    {product.image && (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="p-4">
                    <h3 className="font-bold">{product.name}</h3>
                    <span>R$ {product.price}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
