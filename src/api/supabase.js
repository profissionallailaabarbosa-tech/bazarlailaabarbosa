import { createClient } from "@supabase/supabase-js";

// ----------------------
// 1. CONEXÃO COM O SUPABASE
// ----------------------
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Variaveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY nao configuradas."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);

// ----------------------
// 2. FUNÇÕES DO BANCO DE DADOS
// ----------------------
export const db = {
  // --- PRODUTOS ---
  products: {
    async list() {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async create(product) {
      const { error } = await supabase.from("products").insert([product]);
      if (error) throw error;
    },

    async update(id, updates) {
      const { error } = await supabase.from("products").update(updates).eq("id", id);
      if (error) throw error;
    },

    async delete(id) {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
  },

  // --- PEDIDOS ---
  orders: {
    async list() {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },

    async create(order) {
      const { data, error } = await supabase
        .from("orders")
        .insert([order])
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    async update(id, updates) {
      const { error } = await supabase.from("orders").update(updates).eq("id", id);
      if (error) throw error;
    },
  },

  // --- CONFIGURAÇÕES ---
  settings: {
    async get() {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();

      if (error) throw error;
      return data || {};
    },

    async update(updates) {
      const { error } = await supabase
        .from("settings")
        .upsert({ ...updates, id: 1 });

      if (error) throw error;
    },
  },
};

// ----------------------
// 3. STORAGE (FOTOS)
// ----------------------
export async function uploadImagemProduto(file) {
  const fileExt = file.name.split(".").pop();
  const fileName = `${crypto.randomUUID()}.${fileExt}`;
  const filePath = `produtos/${fileName}`;

  const { error } = await supabase.storage
    .from("bazar")
    .upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage
    .from("bazar")
    .getPublicUrl(filePath);

  return data.publicUrl;
}
