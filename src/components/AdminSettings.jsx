import React, { useState, useEffect } from "react";
import {
  Save, Upload, Smartphone, CreditCard, Truck, MapPin, Instagram
} from "lucide-react";
import { supabase } from "../api/supabase";

export default function AdminSettings() {
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState({
    whatsapp: "",
    instagram: "",
    pix_key: "",
    banner: null,
    enable_pix: true,
    enable_credit_card: false,
    enable_correios: true,
    enable_uber: true,
    enable_pickup: true
  });

  /* ===================== LOAD ===================== */
  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error) {
        console.error(error);
      } else if (data) {
        setSettings(prev => ({ ...prev, ...data }));
      }

      setLoading(false);
    }

    loadSettings();
  }, []);

  /* ===================== SAVE ===================== */
  const handleSave = async () => {
    const { error } = await supabase
      .from("settings")
      .upsert({
        id: 1,
        ...settings
      });

    if (error) {
      console.error(error);
      alert("❌ Erro ao salvar configurações");
    } else {
      alert("✅ Configurações salvas com sucesso!");
    }
  };

  /* ===================== IMAGE ===================== */
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () =>
      setSettings({ ...settings, banner: reader.result });
    reader.readAsDataURL(file);
  };

  /* ===================== TOGGLE ===================== */
  const Toggle = ({ label, checked, onChange, icon: Icon }) => (
    <div className="flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${checked ? "bg-rose-100 text-rose-600" : "bg-gray-100 text-gray-400"}`}>
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <span className="font-medium text-gray-700">{label}</span>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full p-1 transition-colors ${
          checked ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        <div
          className={`w-4 h-4 bg-white rounded-full shadow-md transition-transform ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );

  if (loading) {
    return <div className="p-8 text-center">Carregando...</div>;
  }

  /* ===================== UI ===================== */
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-6">
        Configurações da Loja
      </h2>

      <div className="space-y-8">

        {/* CONTATO */}
        <section className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase">
            Contato e Redes
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">
                WhatsApp
              </label>
              <input
                value={settings.whatsapp}
                onChange={(e) =>
                  setSettings({ ...settings, whatsapp: e.target.value })
                }
                className="w-full p-3 border rounded-lg focus:border-rose-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 block mb-1">
                Link do Instagram
              </label>
              <div className="relative">
                <Instagram className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  value={settings.instagram}
                  onChange={(e) =>
                    setSettings({ ...settings, instagram: e.target.value })
                  }
                  className="w-full p-3 pl-10 border rounded-lg focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">
              Chave PIX
            </label>
            <input
              value={settings.pix_key}
              onChange={(e) =>
                setSettings({ ...settings, pix_key: e.target.value })
              }
              className="w-full p-3 border rounded-lg focus:border-rose-500"
            />
          </div>

          {/* BANNER */}
          <div className="border-2 border-dashed rounded-xl p-4 text-center">
            {settings.banner ? (
              <div className="relative h-32">
                <img
                  src={settings.banner}
                  className="w-full h-full object-cover rounded-lg"
                />
                <label className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-3 py-1 rounded cursor-pointer">
                  Alterar
                  <input type="file" hidden onChange={handleImageChange} />
                </label>
              </div>
            ) : (
              <label className="cursor-pointer text-gray-400 hover:text-rose-500">
                <Upload className="mx-auto mb-1" />
                Adicionar Banner
                <input type="file" hidden onChange={handleImageChange} />
              </label>
            )}
          </div>
        </section>

        {/* PAGAMENTOS */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase">
            Pagamentos & Envios
          </h3>

          <div className="grid md:grid-cols-2 gap-4">
            <Toggle label="Aceitar PIX" icon={Smartphone}
              checked={settings.enable_pix}
              onChange={(v) => setSettings({ ...settings, enable_pix: v })}
            />
            <Toggle label="Aceitar Cartão" icon={CreditCard}
              checked={settings.enable_credit_card}
              onChange={(v) => setSettings({ ...settings, enable_credit_card: v })}
            />
          </div>

          <Toggle label="Correios" icon={Truck}
            checked={settings.enable_correios}
            onChange={(v) => setSettings({ ...settings, enable_correios: v })}
          />
          <Toggle label="Uber / 99" icon={Truck}
            checked={settings.enable_uber}
            onChange={(v) => setSettings({ ...settings, enable_uber: v })}
          />
          <Toggle label="Retirada na Loja" icon={MapPin}
            checked={settings.enable_pickup}
            onChange={(v) => setSettings({ ...settings, enable_pickup: v })}
          />
        </section>

        <button
          onClick={handleSave}
          className="w-full bg-rose-500 text-white py-4 rounded-xl font-bold hover:bg-rose-600"
        >
          <Save className="inline w-5 h-5 mr-2" />
          Salvar Configurações
        </button>

      </div>
    </div>
  );
}
