-- Expira pedidos pendentes antigos e limpa historico antigo de pedidos.
-- Execute este script no SQL Editor do Supabase apos o 002_create_order_with_stock.sql.

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

create index if not exists orders_status_created_at_idx
  on public.orders (status, created_at desc);

create index if not exists orders_payment_status_created_at_idx
  on public.orders (payment_status, created_at desc);

create or replace function public.expire_stale_orders(
  p_pending_hours integer default 2
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer := 0;
begin
  update public.orders
  set status = 'Expirado'
  where created_at <= now() - make_interval(hours => greatest(coalesce(p_pending_hours, 2), 1))
    and lower(coalesce(payment_status, '')) not in ('approved', 'rejected', 'cancelled', 'charged_back', 'refunded')
    and lower(coalesce(status, '')) not in ('expirado', 'enviado', 'entregue')
    and paid_at is null;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.delete_expired_orders(
  p_keep_days integer default 15
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.orders
  where lower(coalesce(status, '')) = 'expirado'
    and created_at <= now() - make_interval(days => greatest(coalesce(p_keep_days, 15), 1));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.delete_completed_orders(
  p_keep_days integer default 180
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.orders
  where lower(coalesce(status, '')) = 'entregue'
    and created_at <= now() - make_interval(days => greatest(coalesce(p_keep_days, 180), 1));

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.run_order_retention(
  p_pending_hours integer default 2,
  p_expired_keep_days integer default 15,
  p_completed_keep_days integer default 180
)
returns table (
  expired_count integer,
  deleted_expired_count integer,
  deleted_completed_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  expired_count := public.expire_stale_orders(p_pending_hours);
  deleted_expired_count := public.delete_expired_orders(p_expired_keep_days);
  deleted_completed_count := public.delete_completed_orders(p_completed_keep_days);
  return next;
end;
$$;

revoke all on function public.expire_stale_orders(integer) from public;
revoke all on function public.delete_expired_orders(integer) from public;
revoke all on function public.delete_completed_orders(integer) from public;
revoke all on function public.run_order_retention(integer, integer, integer) from public;

grant execute on function public.expire_stale_orders(integer) to service_role;
grant execute on function public.delete_expired_orders(integer) to service_role;
grant execute on function public.delete_completed_orders(integer) to service_role;
grant execute on function public.run_order_retention(integer, integer, integer) to service_role;

-- Opcional: se o pg_cron estiver habilitado no seu projeto, agende para rodar automaticamente de madrugada.
-- select cron.schedule(
--   'order-retention-nightly',
--   '0 4 * * *',
--   $$select public.run_order_retention(2, 15, 180);$$
-- );
