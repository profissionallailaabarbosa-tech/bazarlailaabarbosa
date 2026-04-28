drop function if exists public.lookup_orders_by_phone(text);

create or replace function public.lookup_orders_by_phone(
  p_phone text,
  p_order_id bigint default null
)
returns table (
  id bigint,
  created_at timestamptz,
  status text,
  payment_status text,
  total_amount numeric,
  items jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
begin
  v_phone := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');

  if length(v_phone) < 10 or p_order_id is null then
    return;
  end if;

  return query
  select
    o.id,
    o.created_at,
    o.status,
    o.payment_status,
    o.total_amount,
    o.items
  from public.orders o
  where (
    regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = v_phone
    or regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g') = right(v_phone, 11)
    or right(regexp_replace(coalesce(o.customer_phone, ''), '\D', '', 'g'), 11) = right(v_phone, 11)
  )
  and o.id = p_order_id
  limit 1;
end;
$$;

revoke all on function public.lookup_orders_by_phone(text, bigint) from public;

grant execute on function public.lookup_orders_by_phone(text, bigint) to anon, authenticated;
