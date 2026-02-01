import React from 'react';

// Texto de Como Comprar
export const ComoComprar = () => (
  <div className="max-w-3xl mx-auto px-4 py-12">
    <h1 className="text-3xl font-bold text-gray-800 mb-6">Como Comprar</h1>
    <div className="prose text-gray-600 space-y-4">
      <p>1. Navegue pelo site e escolha suas peças favoritas.</p>
      <p>2. Clique na peça para ver detalhes, tamanho e fotos.</p>
      <p>3. Clique em "Adicionar à Sacola" ou "Comprar Agora".</p>
      <p>4. No carrinho, clique em finalizar, preencha seus dados de entrega.</p>
      <p>5. Realize o pagamento via PIX (envie o comprovante) ou Cartão.</p>
      <p>Pronto! Agora é só aguardar seu pedido chegar com muito carinho. 💖</p>
    </div>
  </div>
);

// Texto de Envios
export const Envios = () => (
  <div className="max-w-3xl mx-auto px-4 py-12">
    <h1 className="text-3xl font-bold text-gray-800 mb-6">Envios e Entregas</h1>
    <div className="prose text-gray-600 space-y-4">
      <p>Enviamos para todo o Brasil via <strong>Correios</strong>.</p>
      <p>Para clientes da cidade, oferecemos entrega via <strong>Uber Flash / 99</strong> ou <strong>Retirada Grátis</strong>.</p>
      <p><strong>Prazo de Postagem:</strong> Até 2 dias úteis após a confirmação do pagamento.</p>
      <p>O código de rastreio será enviado para o seu WhatsApp assim que o pedido for postado.</p>
    </div>
  </div>
);

// Texto de Trocas
export const Trocas = () => (
  <div className="max-w-3xl mx-auto px-4 py-12">
    <h1 className="text-3xl font-bold text-gray-800 mb-6">Política de Trocas</h1>
    <div className="prose text-gray-600 space-y-4">
      <p>Por se tratar de um bazar com peças únicas (seminovas), <strong>não realizamos trocas por gosto ou tamanho</strong>, apenas em caso de defeito não sinalizado na descrição.</p>
      <p>Recomendamos conferir as medidas e detalhes na descrição antes de comprar.</p>
      <p>Caso tenha qualquer dúvida sobre a peça, chame no WhatsApp antes de finalizar a compra!</p>
    </div>
  </div>
);