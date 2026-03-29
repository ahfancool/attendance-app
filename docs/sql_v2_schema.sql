create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'student' check (role in ('student', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null check (price > 0),
  duration text not null,
  profile_name text not null,
  limit_uptime text,
  shared_users integer not null default 1 check (shared_users >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null check (amount > 0),
  method text not null check (method in ('manual_transfer', 'qris_static')),
  proof_image_url text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_by uuid references public.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  pool_id uuid references public.voucher_pool(id),
  username text not null unique,
  password text not null,
  price integer not null check (price > 0),
  router_user_id text,
  status text not null default 'assigned' check (status in ('assigned', 'used', 'expired', 'revoked')),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('topup', 'purchase', 'refund', 'adjustment')),
  amount integer not null,
  reference_type text check (reference_type in ('topup', 'voucher', 'manual')),
  reference_id uuid,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'cancelled')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  idem_key text not null,
  endpoint text not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idem_key, endpoint)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists trg_wallets_updated_at on public.wallets;
create trigger trg_wallets_updated_at before update on public.wallets
for each row execute function public.set_updated_at();

drop trigger if exists trg_packages_updated_at on public.packages;
create trigger trg_packages_updated_at before update on public.packages
for each row execute function public.set_updated_at();

drop trigger if exists trg_topups_updated_at on public.topups;
create trigger trg_topups_updated_at before update on public.topups
for each row execute function public.set_updated_at();

drop trigger if exists trg_voucher_pool_updated_at on public.voucher_pool;
create trigger trg_voucher_pool_updated_at before update on public.voucher_pool
for each row execute function public.set_updated_at();

drop trigger if exists trg_vouchers_updated_at on public.vouchers;
create trigger trg_vouchers_updated_at before update on public.vouchers
for each row execute function public.set_updated_at();

create or replace function public.create_wallet_after_user_insert()
returns trigger language plpgsql as $$
begin
  insert into public.wallets (user_id, balance)
  values (new.id, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_create_wallet_after_user_insert on public.users;
create trigger trg_create_wallet_after_user_insert
after insert on public.users
for each row execute function public.create_wallet_after_user_insert();

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
  from public.voucher_pool
  where package_id = p_package_id
    and status = 'available'
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

create index if not exists idx_transactions_user_created on public.transactions (user_id, created_at desc);
create index if not exists idx_topups_status_created on public.topups (status, created_at desc);
create index if not exists idx_vouchers_user_created on public.vouchers (user_id, created_at desc);
create index if not exists idx_vouchers_status on public.vouchers (status);
create index if not exists idx_voucher_pool_pkg_status on public.voucher_pool (package_id, status, created_at asc);
