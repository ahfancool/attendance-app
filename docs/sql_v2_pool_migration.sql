-- Migrasi incremental: mode pre-generated voucher pool

create extension if not exists pgcrypto;

create table if not exists public.voucher_pool (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id),
  username text not null unique,
  password text not null,
  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'invalid')),
  source text not null default 'mikhmon',
  batch_code text,
  generated_at timestamptz not null default now(),
  reserved_at timestamptz,
  sold_at timestamptz,
  sold_to_user_id uuid references public.users(id),
  sold_voucher_id uuid,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vouchers
  add column if not exists pool_id uuid references public.voucher_pool(id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_voucher_pool_updated_at on public.voucher_pool;
create trigger trg_voucher_pool_updated_at before update on public.voucher_pool
for each row execute function public.set_updated_at();

create or replace function public.claim_pool_voucher(p_package_id uuid)
returns table(id uuid, username text, password text, package_id uuid)
language plpgsql
security definer
as $$
declare
  picked public.voucher_pool%rowtype;
begin
  select *
  into picked
  from public.voucher_pool vp
  where vp.package_id = p_package_id
    and vp.status = 'available'
  order by created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.voucher_pool
  set status = 'reserved',
      reserved_at = now(),
      updated_at = now()
  where public.voucher_pool.id = picked.id;

  return query
  select picked.id, picked.username, picked.password, picked.package_id;
end;
$$;

create or replace function public.mark_pool_voucher_sold(
  p_pool_id uuid,
  p_user_id uuid,
  p_voucher_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  update public.voucher_pool
  set status = 'sold',
      sold_at = now(),
      sold_to_user_id = p_user_id,
      sold_voucher_id = p_voucher_id,
      updated_at = now()
  where id = p_pool_id;
end;
$$;

create or replace function public.release_pool_voucher(
  p_pool_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
as $$
begin
  update public.voucher_pool
  set status = 'available',
      reserved_at = null,
      updated_at = now(),
      note = coalesce(p_reason, note)
  where id = p_pool_id
    and status = 'reserved';
end;
$$;

create index if not exists idx_voucher_pool_pkg_status on public.voucher_pool (package_id, status, created_at asc);
