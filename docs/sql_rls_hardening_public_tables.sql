-- Hardening RLS untuk tabel public yang sensitif
-- Tujuan:
-- 1) Aktifkan RLS
-- 2) Tutup akses anon/authenticated
-- 3) Beri policy eksplisit hanya untuk service_role

begin;

alter table public.voucher_pool enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on table public.voucher_pool from anon, authenticated;
revoke all on table public.idempotency_keys from anon, authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'voucher_pool'
      and policyname = 'voucher_pool_service_role_all'
  ) then
    create policy voucher_pool_service_role_all
      on public.voucher_pool
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'idempotency_keys'
      and policyname = 'idempotency_service_role_all'
  ) then
    create policy idempotency_service_role_all
      on public.idempotency_keys
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end;
$$;

commit;
