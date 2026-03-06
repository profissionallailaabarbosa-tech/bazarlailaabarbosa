-- Cria pedido e baixa estoque em uma unica transacao.
-- Execute este script no SQL Editor do Supabase.

create or replace function public.create_order_with_stock(
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_total_amount numeric,
  p_payment_method text,
  p_delivery_method text,
  p_status text,
  p_items jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_product_id bigint;
  v_qty integer;
  v_stock integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Carrinho vazio';
  end if;

  -- Valida e trava o estoque dos produtos para evitar corrida.
  for v_item in
    select value
    from jsonb_array_elements(p_items) as t(value)
  loop
    v_product_id := nullif(v_item->>'id', '')::bigint;
    v_qty := coalesce(
      nullif(v_item->>'quantitySelected', '')::integer,
      nullif(v_item->>'quantity', '')::integer,
      1
    );

    if v_product_id is null then
      raise exception 'Item de produto invalido';
    end if;
    if v_qty <= 0 then
      raise exception 'Quantidade invalida para o produto %', v_product_id;
    end if;

    select quantity
    into v_stock
    from public.products
    where id = v_product_id
    for update;

    if not found then
      raise exception 'Produto % nao encontrado', v_product_id;
    end if;

    if coalesce(v_stock, 0) < v_qty then
      raise exception 'Estoque insuficiente para o produto %', v_product_id;
    end if;
  end loop;

  insert into public.orders (
    customer_name,
    customer_phone,
    address,
    total_amount,
    payment_method,
    delivery_method,
    status,
    items
  )
  values (
    p_customer_name,
    p_customer_phone,
    p_address,
    p_total_amount,
    p_payment_method,
    p_delivery_method,
    p_status,
    p_items
  )
  returning * into v_order;

  -- Atualiza estoque depois da validacao.
  for v_item in
    select value
    from jsonb_array_elements(p_items) as t(value)
  loop
    v_product_id := nullif(v_item->>'id', '')::bigint;
    v_qty := coalesce(
      nullif(v_item->>'quantitySelected', '')::integer,
      nullif(v_item->>'quantity', '')::integer,
      1
    );

    update public.products
    set quantity = greatest(0, coalesce(quantity, 0) - v_qty)
    where id = v_product_id;
  end loop;

  return v_order;
end;
$$;

revoke all on function public.create_order_with_stock(
  text, text, text, numeric, text, text, text, jsonb
) from public;

grant execute on function public.create_order_with_stock(
  text, text, text, numeric, text, text, text, jsonb
) to anon, authenticated;

-- Bloqueia insercao direta em orders; o checkout deve usar apenas a funcao acima.
drop policy if exists orders_insert_public on public.orders;
