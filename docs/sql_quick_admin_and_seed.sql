-- Quick Ops SQL
-- Tujuan:
-- 1) Promosikan akun jadi admin
-- 2) Seed voucher_pool cepat untuk uji alur beli voucher
--
-- Penting:
-- Voucher hasil seed dummy TIDAK otomatis valid di RouterOS.
-- Untuk produksi, isi voucher_pool dari hasil generate Mikhmon.

-- ============================================================
-- BAGIAN A - PROMOSIKAN USER JADI ADMIN
-- ============================================================
-- Ganti email ini dengan akun yang mau dijadikan admin.
-- Contoh: admin@sekolah.sch.id

update public.users
set role = 'admin',
    updated_at = now()
where email = 'admin@sekolah.sch.id';

-- Verifikasi hasil update role:
select id, name, email, role, created_at
from public.users
where email = 'admin@sekolah.sch.id';

-- ============================================================
-- BAGIAN B - SEED VOUCHER_POOL DUMMY (untuk testing flow)
-- ============================================================
-- Opsional helper function untuk isi cepat voucher_pool.
-- Jalankan sekali, lalu panggil fungsi di bawah.

create or replace function public.seed_voucher_pool_dummy(
  p_per_package integer default 5,
  p_batch_code text default null
)
returns integer
language plpgsql
as $$
declare
  inserted_count integer := 0;
begin
  if p_per_package < 1 then
    raise exception 'p_per_package minimal 1';
  end if;

  insert into public.voucher_pool (
    package_id,
    username,
    password,
    status,
    source,
    batch_code,
    generated_at,
    note
  )
  select
    p.id as package_id,
    -- Prefix DUMMY agar mudah difilter/hapus lagi
    'D' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 11)) as username,
    upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 10)) as password,
    'available' as status,
    'seed_sql' as source,
    coalesce(p_batch_code, 'DUMMY-' || to_char(now(), 'YYYYMMDD-HH24MISS')) as batch_code,
    now() as generated_at,
    'DUMMY TEST ONLY - bukan dari Mikhmon' as note
  from public.packages p
  cross join generate_series(1, p_per_package) g
  where p.is_active = true;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

-- Jalankan seed: 5 voucher per paket aktif
-- Ubah jadi 10 kalau mau: select public.seed_voucher_pool_dummy(10);
select public.seed_voucher_pool_dummy(5);

-- ============================================================
-- BAGIAN C - MONITORING STOK
-- ============================================================

select
  p.name as package_name,
  vp.package_id,
  count(*) filter (where vp.status = 'available') as stok_available,
  count(*) filter (where vp.status = 'reserved') as stok_reserved,
  count(*) filter (where vp.status = 'sold') as stok_sold
from public.voucher_pool vp
join public.packages p on p.id = vp.package_id
group by p.name, vp.package_id
order by p.name;

-- ============================================================
-- BAGIAN D - TEMPLATE IMPORT VOUCHER REAL DARI MIKHMON
-- ============================================================
-- Pakai ini untuk produksi (contoh):
--
-- insert into public.voucher_pool (
--   package_id, username, password, status, source, batch_code, generated_at, note
-- ) values
--   ('<uuid-package-1h>', 'V123ABC', '8KMNPQ2R', 'available', 'mikhmon', 'BATCH-20260329-A', now(), 'import mikhmon'),
--   ('<uuid-package-1h>', 'V123ABD', '7LMNPQ3S', 'available', 'mikhmon', 'BATCH-20260329-A', now(), 'import mikhmon')
-- on conflict (username) do nothing;

