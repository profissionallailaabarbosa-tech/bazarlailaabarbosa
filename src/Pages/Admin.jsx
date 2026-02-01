import React, { useState, useEffect } from "react";
import { db, supabase } from "../api/supabase"; 
import { 
  Package, ShoppingBag, Settings, Plus, Trash, Image as ImageIcon, 
  CreditCard, Truck, Video, Users, Clock, AlignLeft, Check, Lock, Loader2, X
} from "lucide-react";

// Botão Switch (Visual)
const Switch = ({ checked, onChange }) => (
  <button type="button" onClick={() => onChange(!checked)} className={`w-10 h-5 rounded-full transition-colors relative ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
    <div className={`w-3 h-3 bg-white rounded-full shadow-md absolute top-1 transition-all duration-300 ${checked ? 'left-6' : 'left-1'}`} />
  </button>
);

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [activeTab, setActiveTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Estados de Upload
  const [imageFile, setImageFile] = useState(null); // Capa
  const [galleryFiles, setGalleryFiles] = useState([]); // Galeria (Arquivos)
  const [galleryPreviews, setGalleryPreviews] = useState([]); // Galeria (Prévias Visuais)

  const [form, setForm] = useState({ name: "", description: "", price: "", category: "vestidos", size: "", quantity: "1", image: null, gallery: [], featured: false });
  const [config, setConfig] = useState({});

  useEffect(() => { 
    const isAuth = sessionStorage.getItem("admin_auth");
    if (isAuth) {
        setIsAuthenticated(true);
        loadData(); 
        loadConfig();
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (passwordInput === "laila123") {
        setIsAuthenticated(true);
        sessionStorage.setItem("admin_auth", "true");
        loadData();
        loadConfig();
    } else {
        alert("Senha incorreta!");
    }
  };

  async function loadData() {
    try {
      const prods = await db.products.list();
      setProducts(prods || []);
      const { data: ords } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
      setOrders(ords || []);
    } catch (error) { console.error(error); }
  }

  async function loadConfig() {
    try {
      const { data } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
      if (data) setConfig(data);
    } catch (error) { console.log("Erro config", error); }
  }

  // --- UPLOAD CAPA ---
  const handleProductImage = (e) => { 
      const file = e.target.files[0]; 
      if (file) { 
          setImageFile(file); 
          const reader = new FileReader(); 
          reader.onloadend = () => setForm({ ...form, image: reader.result }); 
          reader.readAsDataURL(file); 
      }
  };

  // --- UPLOAD GALERIA (Múltiplas Fotos) ---
  const handleGalleryImages = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
          setGalleryFiles(prev => [...prev, ...files]);
          
          files.forEach(file => {
              const reader = new FileReader();
              reader.onloadend = () => setGalleryPreviews(prev => [...prev, reader.result]);
              reader.readAsDataURL(file);
          });
      }
  };

  const removeGalleryImage = (index) => {
      setGalleryFiles(prev => prev.filter((_, i) => i !== index));
      setGalleryPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfigBanner = (e) => { const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onloadend = () => setConfig({ ...config, banner_image_url: reader.result }); reader.readAsDataURL(file); }};

  // --- FUNÇÃO AUXILIAR DE UPLOAD ---
  const uploadFileToSupabase = async (file) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      
      const { error } = await supabase.storage.from('images').upload(fileName, file);
      if (error) throw error;
      
      const { data } = supabase.storage.from('images').getPublicUrl(fileName);
      return data.publicUrl;
  };

  // --- SALVAR PRODUTO ---
  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) return alert("Preencha nome e preço!");
    
    setLoading(true);
    try {
      let finalImageUrl = form.image;
      
      // 1. Sobe Capa
      if (imageFile) {
          try {
             finalImageUrl = await uploadFileToSupabase(imageFile);
          } catch (err) {
             alert("Erro ao subir capa. Verifique se o bucket 'images' existe e é público.");
             throw err;
          }
      }

      // 2. Sobe Galeria
      let finalGalleryUrls = [];
      if (galleryFiles.length > 0) {
          try {
             finalGalleryUrls = await Promise.all(galleryFiles.map(file => uploadFileToSupabase(file)));
          } catch (err) {
             alert("Erro ao subir galeria.");
             throw err;
          }
      }

      const precoLimpo = form.price.toString().replace(',', '.');
      
      const productData = {
        name: form.name,
        description: form.description || "",
        price: parseFloat(precoLimpo) || 0,
        category: form.category,
        size: form.size,
        quantity: parseInt(form.quantity) || 1,
        image: finalImageUrl,
        gallery: finalGalleryUrls.length > 0 ? finalGalleryUrls : null,
        featured: form.featured || false
      };

      const { error } = await supabase.from('products').insert([productData]);

      if (error) throw error;
      
      alert("Produto e Fotos Salvos com Sucesso! 📸");
      
      setForm({ name: "", description: "", price: "", category: "vestidos", size: "", quantity: "1", image: null, gallery: [], featured: false });
      setImageFile(null);
      setGalleryFiles([]);
      setGalleryPreviews([]);
      loadData();

    } catch (error) { 
        console.error(error);
        alert("Erro ao salvar: " + (error.message || "Erro desconhecido")); 
    } finally { 
        setLoading(false); 
    }
  };

  const handleDeleteProduct = async (id) => { if (confirm("Apagar?")) { await db.products.delete(id); loadData(); }};
  const updateOrderStatus = async (id, newStatus) => { try { if (newStatus === 'Entregue') { if(confirm("Marcar Entregue e remover?")) { await supabase.from('orders').delete().eq('id', id); loadData(); } } else { await supabase.from('orders').update({ status: newStatus }).eq('id', id); loadData(); } } catch (e) { alert("Erro ao atualizar"); } };
  
  // --- SALVAR CONFIGURAÇÕES ---
  const handleSaveConfig = async () => {
    try {
      setSavingConfig(true);
      const { id, ...configData } = config;
      const { error } = await supabase.from('settings').update(configData).eq('id', 1);
      if (error) throw error;
      alert("Configurações Salvas com Sucesso! ✅");
    } catch (err) { 
        console.error(err);
        alert("Erro ao salvar config: " + err.message); 
    } finally { 
        setSavingConfig(false); 
    }
  };

  if (!isAuthenticated) { return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4"><form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100 text-center"><div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6"><Lock size={32} /></div><h1 className="text-2xl font-bold text-gray-800 mb-2">Acesso Restrito</h1><input type="password" placeholder="Senha" className="w-full p-4 border rounded-xl mb-4 text-center" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} /><button className="w-full bg-rose-500 text-white font-bold py-4 rounded-xl">Entrar</button></form></div>; }

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-700 pb-20 animate-in fade-in">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <h1 className="text-xl font-bold text-rose-500">Painel Admin</h1>
        <div className="flex gap-2 text-sm">
          <button onClick={() => setActiveTab("products")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "products" ? "bg-rose-500 text-white" : "bg-gray-100"}`}>Produtos</button>
          <button onClick={() => setActiveTab("orders")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "orders" ? "bg-rose-500 text-white" : "bg-gray-100"}`}>Pedidos</button>
          <button onClick={() => setActiveTab("config")} className={`px-4 py-2 rounded-full font-bold transition ${activeTab === "config" ? "bg-rose-500 text-white" : "bg-gray-100"}`}>Configurações</button>
          <button onClick={() => { setIsAuthenticated(false); sessionStorage.removeItem("admin_auth"); }} className="ml-2 px-3 py-2 rounded-full border border-gray-200 text-red-500 hover:bg-red-50">Sair</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {activeTab === "products" && (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 sticky top-24">
                <h2 className="text-sm font-bold mb-4 flex items-center gap-2 text-rose-500"><Plus size={16}/> Novo Lookinho</h2>
                <form onSubmit={handleSaveProduct} className="space-y-3">
                  
                  {/* FOTO DE CAPA */}
                  <div className="w-full aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center hover:bg-gray-50 cursor-pointer relative overflow-hidden bg-gray-50">
                    {form.image ? <img src={form.image} className="w-full h-full object-cover" /> : <div className="text-center text-gray-400"><ImageIcon className="w-8 h-8 mx-auto mb-2"/><span className="text-xs font-bold">Capa Principal</span></div>}
                    <input type="file" accept="image/*" onChange={handleProductImage} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </div>

                  {/* GALERIA */}
                  <div>
                      <label className="block text-xs font-bold text-gray-500 mb-2">Galeria (Várias Fotos)</label>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                          {galleryPreviews.map((src, i) => (
                              <div key={i} className="aspect-square relative rounded overflow-hidden border">
                                  <img src={src} className="w-full h-full object-cover" />
                                  <button type="button" onClick={() => removeGalleryImage(i)} className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl"><X size={10}/></button>
                              </div>
                          ))}
                          <div className="aspect-square border-2 border-dashed rounded flex items-center justify-center hover:bg-gray-50 relative cursor-pointer">
                              <Plus size={20} className="text-gray-400"/>
                              <input type="file" multiple accept="image/*" onChange={handleGalleryImages} className="absolute inset-0 opacity-0 cursor-pointer" />
                          </div>
                      </div>
                      <p className="text-[10px] text-gray-400">Clique no + para adicionar extras.</p>
                  </div>

                  <input placeholder="Nome" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
                  <textarea rows="3" placeholder="Descrição..." className="w-full p-2 bg-gray-50 rounded text-sm resize-none border border-gray-200" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                  <div className="grid grid-cols-3 gap-2">
                    <input placeholder="R$" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
                    <input placeholder="Tam" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.size} onChange={e => setForm({...form, size: e.target.value})} />
                    <input type="number" placeholder="Qtd" className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.quantity} onChange={e => setForm({...form, quantity: e.target.value})} />
                  </div>
                  <select className="w-full p-2 bg-gray-50 rounded text-sm border border-gray-200" value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {["vestidos", "conjuntos", "blusas", "saias", "calcas", "acessorios"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button disabled={loading} className="w-full bg-rose-500 text-white font-bold py-2 rounded hover:bg-rose-600 text-sm flex justify-center items-center">
                    {loading ? <Loader2 className="animate-spin w-5 h-5"/> : "Cadastrar Produto"}
                  </button>
                </form>
              </div>
            </div>
            
            <div className="lg:col-span-2 space-y-3">
              {products.map(p => (
                <div key={p.id} className="bg-white p-3 rounded-lg border border-gray-100 flex gap-3 items-center shadow-sm">
                  <img src={p.image || "https://placehold.co/50"} className="w-14 h-14 rounded object-cover bg-gray-100" />
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-800 text-sm">{p.name}</h3>
                    <p className="text-xs text-gray-500">{p.gallery ? `+${p.gallery.length} fotos extras` : 'Sem galeria'}</p>
                    <p className="text-rose-500 font-bold text-sm">R$ {p.price}</p>
                  </div>
                  <button onClick={() => handleDeleteProduct(p.id)} className="p-2 text-gray-300 hover:text-red-500"><Trash size={16}/></button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {activeTab === "orders" && (
            <div className="space-y-4">
               {orders.length === 0 ? <div className="bg-white p-8 rounded text-center text-gray-400">Sem pedidos.</div> : orders.map(order => (
                    <div key={order.id} className="bg-white p-4 rounded border border-gray-100 flex justify-between">
                        <div><h3 className="font-bold text-sm">#{order.id} - {order.customer_name}</h3><span className="text-xs bg-gray-100 px-2 rounded">{order.status}</span></div>
                        <div className="text-right"><p className="font-bold text-rose-500 text-sm">R$ {order.total_amount}</p>
                        <div className="flex gap-1 mt-1"><button onClick={() => updateOrderStatus(order.id, 'Enviado')} className="text-[10px] bg-blue-50 text-blue-600 px-2 py-1 rounded">Enviado</button><button onClick={() => updateOrderStatus(order.id, 'Entregue')} className="text-[10px] bg-green-50 text-green-600 px-2 py-1 rounded">Entregue</button></div></div>
                    </div>
                ))}
            </div>
        )}

        {/* ABA CONFIGURAÇÕES COMPLETA */}
        {activeTab === "config" && (
          <div className="space-y-5 animate-in fade-in max-w-3xl mx-auto">
            
            {/* Banner e Whats */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
               <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><Settings size={16} className="text-rose-500"/> Geral</h2>
               <div className="space-y-3">
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">Banner Principal</label>
                   <div className="border border-gray-200 rounded p-2 flex items-center gap-3 bg-gray-50">
                      {config.banner_image_url && <img src={config.banner_image_url} className="h-12 w-20 object-cover rounded" />}
                      <input type="file" onChange={handleConfigBanner} className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-full file:bg-white file:border file:border-gray-200 file:text-xs hover:file:bg-gray-100 cursor-pointer"/>
                   </div>
                 </div>
                 <div>
                   <label className="block text-xs font-bold text-gray-500 mb-1">WhatsApp</label>
                   <input className="w-full p-2 border border-gray-200 rounded text-sm" placeholder="Ex: 5511..." value={config.whatsapp_number} onChange={e => setConfig({...config, whatsapp_number: e.target.value})} />
                 </div>
               </div>
            </div>

            {/* Pagamentos */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
               <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><CreditCard size={16} className="text-rose-500"/> Pagamentos</h2>
               <div className="grid md:grid-cols-2 gap-4">
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">PIX</span><Switch checked={config.enable_pix} onChange={c => setConfig({...config, enable_pix: c})} /></div>
                    {config.enable_pix && (
                        <div className="space-y-2">
                            <input className="w-full p-2 border border-gray-200 rounded text-xs" placeholder="Chave PIX" value={config.pix_key} onChange={e => setConfig({...config, pix_key: e.target.value})} />
                            <textarea className="w-full p-2 border border-gray-200 rounded text-xs" rows="2" placeholder="Instruções" value={config.payment_pix_instructions} onChange={e => setConfig({...config, payment_pix_instructions: e.target.value})} />
                        </div>
                    )}
                 </div>
                 <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Cartão</span><Switch checked={config.enable_credit_card} onChange={c => setConfig({...config, enable_credit_card: c})} /></div>
                    {config.enable_credit_card && (<textarea className="w-full p-2 border border-gray-200 rounded text-xs" rows="3" placeholder="Instruções/Link" value={config.payment_card_instructions} onChange={e => setConfig({...config, payment_card_instructions: e.target.value})} />)}
                 </div>
               </div>
               <div className="mt-3 flex justify-between items-center bg-green-50 p-3 rounded border border-green-100">
                  <div><span className="font-bold text-xs text-green-800">Checkout WhatsApp</span><p className="text-[10px] text-green-600">Enviar pedido direto</p></div>
                  <Switch checked={config.enable_whatsapp_checkout} onChange={c => setConfig({...config, enable_whatsapp_checkout: c})} />
               </div>
            </div>

            {/* Entrega */}
            <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
               <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-gray-800"><Truck size={16} className="text-rose-500"/> Entrega e Email</h2>
               <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                     <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Emails</span><Switch checked={config.enable_email_notifications} onChange={c => setConfig({...config, enable_email_notifications: c})} /></div>
                     {config.enable_email_notifications && <input className="w-full p-2 border border-gray-200 rounded text-xs" placeholder="Remetente" value={config.email_sender_name} onChange={e => setConfig({...config, email_sender_name: e.target.value})} />}
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                     <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Correios</span><Switch checked={config.enable_shipping_calc} onChange={c => setConfig({...config, enable_shipping_calc: c})} /></div>
                     {config.enable_shipping_calc && (<div className="grid grid-cols-2 gap-2"><input className="col-span-2 p-2 border border-gray-200 rounded text-xs" placeholder="CEP Origem" value={config.shipping_origin_cep} onChange={e => setConfig({...config, shipping_origin_cep: e.target.value})} /><input className="p-2 border border-gray-200 rounded text-xs" type="number" placeholder="Local R$" value={config.shipping_local_price} onChange={e => setConfig({...config, shipping_local_price: e.target.value})} /><input className="p-2 border border-gray-200 rounded text-xs" type="number" placeholder="Nacional R$" value={config.shipping_national_price} onChange={e => setConfig({...config, shipping_national_price: e.target.value})} /></div>)}
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200">
                      <div className="flex justify-between items-center mb-2"><span className="font-bold text-xs">Uber/99</span><Switch checked={config.enable_uber} onChange={c => setConfig({...config, enable_uber: c})} /></div>
                      {config.enable_uber && <input className="w-full p-2 border border-gray-200 rounded text-xs" placeholder="Link Whats" value={config.uber_whatsapp_link} onChange={e => setConfig({...config, uber_whatsapp_link: e.target.value})} />}
                  </div>
                  <div className="bg-gray-50 p-3 rounded border border-gray-200 flex justify-between items-center">
                      <span className="font-bold text-xs">Retirada</span><Switch checked={config.enable_pickup} onChange={c => setConfig({...config, enable_pickup: c})} />
                  </div>
               </div>
            </div>

            <div className="sticky bottom-4">
              <button onClick={handleSaveConfig} disabled={savingConfig} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl shadow-lg transition-all text-sm">{savingConfig ? "Salvando..." : "Salvar Configurações"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}