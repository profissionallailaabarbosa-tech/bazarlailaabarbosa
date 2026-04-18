import React from "react";

function InfoLayout({ eyebrow, title, children }) {
  return (
    <div className="min-h-screen bg-[#fffaf7] py-10 font-sans">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-[2rem] border border-rose-100 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.05)] sm:p-8">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-rose-300">{eyebrow}</p>
          <h1 className="mb-6 text-3xl font-bold text-gray-800">{title}</h1>
          <div className="space-y-4 text-[15px] leading-relaxed text-gray-600">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function ComoComprar() {
  return (
    <InfoLayout eyebrow="Ajuda" title="Como comprar">
      <p>1. Navegue pelo site e escolha suas peças favoritas.</p>
      <p>2. Clique na peça para ver detalhes, tamanho, fotos e stories quando estiverem disponíveis.</p>
      <p>3. Toque em <strong>Adicionar à Sacola</strong> ou <strong>Comprar Agora</strong>.</p>
      <p>4. No checkout, preencha seus dados, escolha a forma de entrega e confirme o pagamento.</p>
      <p>5. Depois da aprovação, você será direcionada para o WhatsApp da loja para alinhar entrega, retirada ou qualquer detalhe final.</p>
      <p>Pronto. Seu pedido fica registrado e você ainda pode acompanhar depois em <strong>Meus Pedidos</strong>.</p>
    </InfoLayout>
  );
}

export function Envios() {
  return (
    <InfoLayout eyebrow="Informações" title="Envios e entregas">
      <p>Enviamos para todo o Brasil via <strong>Correios</strong>.</p>
      <p>Para clientes da cidade, oferecemos entrega via <strong>Uber Flash / 99</strong> ou <strong>retirada grátis</strong>.</p>
      <p><strong>Prazo de postagem:</strong> até 2 dias úteis após a confirmação do pagamento.</p>
      <p>Quando o pedido for postado, a loja envia o andamento pelo WhatsApp.</p>
    </InfoLayout>
  );
}

export function Trocas() {
  return (
    <InfoLayout eyebrow="Política" title="Trocas">
      <p>Como trabalhamos com peças únicas e seminovas, <strong>não realizamos trocas por gosto, tamanho ou expectativa</strong>.</p>
      <p>Se houver algum defeito não informado na descrição, fale com a loja pelo WhatsApp para avaliarmos o caso com cuidado.</p>
      <p>Antes de comprar, confira fotos, vídeos, descrição e, se precisar, tire suas dúvidas no atendimento.</p>
    </InfoLayout>
  );
}
