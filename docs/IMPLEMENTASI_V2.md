# Dokumen Implementasi V2 - Hotspot Wallet (RouterOS v6 + tunnel.web.id)

Versi: 2.0  
Tanggal: 2026-03-29  
Status: Siap Eksekusi

## Update Keputusan Implementasi (2026-03-29)

Mode produksi yang dipakai: **Pre-Generate Voucher dari Mikhmon -> simpan ke `voucher_pool` -> Worker ambil dari pool DB saat pembelian**.

Konsekuensi:
- Tidak ada create voucher realtime ke RouterOS saat user beli.
- Integrasi `tunnel.web.id` menjadi opsional (hanya jika nanti kembali ke mode realtime).
- UX user tetap sama: beli voucher lalu 1 klik untuk login hotspot.

## 1. Tujuan V2

Dokumen ini menggantikan detail implementasi sebelumnya dengan fokus:
- 100% biaya operasional nol (free tier only)
- Kompatibel RouterOS v6
- Operasional voucher berbasis stok pre-generate dari Mikhmon (pool DB)
- UX sederhana: user selesai beli voucher cukup klik 1 tombol untuk online, tanpa isi form login hotspot manual

---

## 2. Arsitektur Eksekusi Final

- Frontend: GitHub Pages (gratis)
- Backend API: Cloudflare Workers (gratis)
- Database + object storage bukti transfer: Supabase Free
- Router: MikroTik RouterOS v6
- Voucher source: Mikhmon (pre-generated) -> import ke `voucher_pool`

Alur inti:
1. User login portal wallet.
2. User beli voucher (`/api/buy-voucher`).
3. Worker klaim 1 voucher `available` dari `voucher_pool` secara atomic.
4. Saldo user dipotong, voucher dipindah ke tabel `vouchers`.
5. User klik tombol `Aktifkan Internet`.
6. Frontend redirect ke `http://<gateway-lokal>/login?username=...&password=...`.
7. RouterOS memvalidasi dan user online.

---

## 3. Kontrak Endpoint API (Public App API)

Base URL contoh: `https://hotspot-wallet-api.<subdomain>.workers.dev`

### 3.1 Auth

#### POST `/api/register`
Request:
```json
{
  "name": "Budi",
  "email": "budi@sekolah.sch.id",
  "password": "rahasia123"
}
```
Response 201:
```json
{
  "message": "Registrasi berhasil",
  "user": {
    "id": "uuid",
    "name": "Budi",
    "email": "budi@sekolah.sch.id",
    "role": "student"
  }
}
```

#### POST `/api/login`
Request:
```json
{
  "email": "budi@sekolah.sch.id",
  "password": "rahasia123"
}
```
Response 200:
```json
{
  "message": "Login berhasil",
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "name": "Budi",
    "email": "budi@sekolah.sch.id",
    "role": "student"
  }
}
```

#### GET `/api/me`
Header: `Authorization: Bearer <token>`

Response 200:
```json
{
  "user": {
    "id": "uuid",
    "name": "Budi",
    "email": "budi@sekolah.sch.id",
    "role": "student"
  },
  "wallet": {
    "balance": 25000,
    "updated_at": "2026-03-29T06:00:00.000Z"
  }
}
```

### 3.2 Wallet & Topup

#### GET `/api/wallet`
Auth: JWT

Response 200:
```json
{
  "balance": 25000,
  "updated_at": "2026-03-29T06:00:00.000Z"
}
```

#### POST `/api/topup`
Auth: JWT

Request:
```json
{
  "amount": 50000,
  "method": "qris_static",
  "proof_image_url": "https://<supabase-public-url>/proofs/abc.jpg"
}
```
Response 201:
```json
{
  "message": "Permintaan topup berhasil diajukan",
  "topup": {
    "id": "uuid",
    "amount": 50000,
    "method": "qris_static",
    "status": "pending",
    "created_at": "2026-03-29T06:02:00.000Z"
  }
}
```

#### GET `/api/transactions`
Auth: JWT

Response 200:
```json
{
  "transactions": []
}
```

### 3.3 Voucher

#### GET `/api/packages`
Auth: JWT (boleh dibuka public jika dibutuhkan)

Response 200:
```json
{
  "packages": [
    {
      "id": "uuid",
      "name": "1 Jam",
      "price": 2000,
      "duration": "1h",
      "profile_name": "PKG-1H",
      "is_active": true
    }
  ]
}
```

#### POST `/api/buy-voucher`
Auth: JWT

Sumber voucher: diambil dari tabel `voucher_pool` status `available`.

Request:
```json
{
  "package_id": "uuid"
}
```

Response 409 (stok habis):
```json
{
  "error": "Stok voucher habis",
  "detail": "Admin perlu generate ulang voucher di Mikhmon lalu isi pool database"
}
```
Response 201:
```json
{
  "message": "Voucher berhasil dibeli",
  "voucher": {
    "id": "uuid",
    "username": "V4AB9XZ",
    "password": "7G8K2LMN",
    "package_name": "1 Jam",
    "duration": "1h",
    "price": 2000,
    "created_at": "2026-03-29T06:05:00.000Z"
  },
  "remaining_balance": 23000
}
```

#### GET `/api/my-vouchers`
Auth: JWT

Response 200:
```json
{
  "vouchers": []
}
```

### 3.4 Admin

#### GET `/api/admin/users`
Auth: JWT admin

#### GET `/api/admin/topups`
Auth: JWT admin

#### POST `/api/admin/topup/confirm`
Auth: JWT admin

Request:
```json
{
  "topup_id": "uuid",
  "action": "confirm"
}
```

#### POST `/api/admin/revoke-voucher`
Auth: JWT admin

Request:
```json
{
  "voucher_username": "V4AB9XZ"
}
```

---

## 4. Kontrak Endpoint Internal Worker <-> tunnel.web.id (Opsional)

Endpoint ini hanya dipakai jika sistem kembali ke mode realtime RouterOS.

Base URL contoh:
`https://<tenant>.tunnel.web.id/hotspot-wallet/v1`

Header wajib:
- `X-Api-Key: <TUNNEL_SHARED_KEY>`
- `X-Timestamp: <unix_seconds>`
- `X-Signature: <HMAC_SHA256(body + timestamp, TUNNEL_SHARED_KEY)>`

Aturan:
- Tolak request jika timestamp selisih > 300 detik.
- Hanya izinkan IP egress Cloudflare Worker (jika tunnel mendukung IP allowlist).
- Semua response JSON.

### 4.1 POST `/routeros/voucher/create`
Request:
```json
{
  "username": "V4AB9XZ",
  "password": "7G8K2LMN",
  "profile_name": "PKG-1H",
  "comment": "uid:9f1...|vid:c12...",
  "limit_uptime": "1h",
  "server": "hotspot1"
}
```

Response sukses:
```json
{
  "success": true,
  "data": {
    "router_user_id": "*A12",
    "username": "V4AB9XZ"
  }
}
```

### 4.2 POST `/routeros/voucher/revoke`
Request:
```json
{
  "username": "V4AB9XZ",
  "remove_active": true
}
```

Response sukses:
```json
{
  "success": true,
  "data": {
    "username": "V4AB9XZ",
    "revoked": true
  }
}
```

### 4.3 GET `/routeros/health`
Response 200:
```json
{
  "success": true,
  "data": {
    "routeros": "reachable",
    "version": "6.x",
    "identity": "MikroTik-Sekolah"
  }
}
```

---

## 5. Struktur Tabel Final (Supabase PostgreSQL)

> Catatan: gunakan `gen_random_uuid()` dan aktifkan extension `pgcrypto`.
> Pembaruan mode pool: schema final mencakup tabel `voucher_pool` + fungsi RPC `claim_pool_voucher`, `mark_pool_voucher_sold`, `release_pool_voucher`.
> Versi SQL paling mutakhir ada di file `docs/sql_v2_schema.sql`.

```sql
create extension if not exists pgcrypto;

-- 1) USERS
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

-- 2) WALLETS (1 user = 1 wallet)
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) PACKAGES
create table if not exists public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price integer not null check (price > 0),
  duration text not null,                 -- contoh: 1h, 1d
  profile_name text not null,             -- profile hotspot di RouterOS
  limit_uptime text,                      -- opsional; contoh: 1h
  shared_users integer not null default 1 check (shared_users >= 1),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) TOPUPS
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

-- 5) VOUCHERS
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  package_id uuid not null references public.packages(id),
  username text not null unique,
  password text not null,
  price integer not null check (price > 0),
  router_user_id text,                    -- id user hotspot dari RouterOS (jika ada)
  status text not null default 'assigned' check (status in ('assigned', 'used', 'expired', 'revoked')),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 6) TRANSACTIONS
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

-- 7) IDEMPOTENCY KEY (penting untuk anti double charge)
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  idem_key text not null,
  endpoint text not null,
  response_json jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, idem_key, endpoint)
);

-- Trigger auto update timestamp
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

drop trigger if exists trg_vouchers_updated_at on public.vouchers;
create trigger trg_vouchers_updated_at before update on public.vouchers
for each row execute function public.set_updated_at();

-- Trigger auto-create wallet saat user dibuat
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

-- Index penting
create index if not exists idx_transactions_user_created on public.transactions (user_id, created_at desc);
create index if not exists idx_topups_status_created on public.topups (status, created_at desc);
create index if not exists idx_vouchers_user_created on public.vouchers (user_id, created_at desc);
create index if not exists idx_vouchers_status on public.vouchers (status);
```

---

## 6. RLS Minimum (Final)

- `users`: student hanya bisa lihat/update profil sendiri.
- `wallets`: student hanya bisa lihat wallet sendiri.
- `topups`: student hanya bisa create dan lihat topup milik sendiri.
- `vouchers`: student hanya bisa lihat voucher milik sendiri.
- `transactions`: student hanya bisa lihat transaksi milik sendiri.
- role `admin`: full access untuk panel admin.

Catatan implementasi: karena Worker sekarang memakai service key, RLS bisa tetap aktif sebagai guard tambahan, tetapi kontrol utama tetap lewat API Worker.

---

## 7. Checklist Konfigurasi RouterOS v6 (Siap Eksekusi)

## 7.1 Prasyarat
- [ ] RouterOS versi 6.x aktif dan hotspot sudah berjalan.
- [ ] Timezone router benar.
- [ ] DNS router berjalan normal.
- [ ] Backup konfigurasi sebelum perubahan.

## 7.2 Login Method Hotspot
- [ ] Pastikan profile hotspot mengaktifkan `http-pap` (untuk URL login username/password).
- [ ] Nonaktifkan metode yang tidak dipakai jika perlu untuk menyederhanakan UX.

Contoh cek:
```routeros
/ip hotspot profile print detail
```

## 7.3 Walled Garden
Wajib allow domain berikut agar portal bisa diakses sebelum login:
- [ ] `*.github.io`
- [ ] `*.workers.dev`
- [ ] `*.supabase.co`
- [ ] Domain tunnel jika dipakai di browser client

Contoh (sesuaikan profile/server hotspot):
```routeros
/ip hotspot walled-garden add dst-host=*.github.io action=allow
/ip hotspot walled-garden add dst-host=*.workers.dev action=allow
/ip hotspot walled-garden add dst-host=*.supabase.co action=allow
```

## 7.4 Redirect Login Page ke Portal Wallet
- [ ] Edit file `login.html` hotspot agar redirect ke portal.
- [ ] Pastikan URL HTTPS portal valid.

Contoh script di `login.html`:
```html
<script>
  window.location.href = "https://<username>.github.io/<repo>/";
</script>
```

## 7.5 Uji Auto-Connect dari Client
- [ ] Setelah beli voucher, tombol `Aktifkan Internet` melakukan redirect:
  `http://<gateway-ip>/login?username=<voucher_user>&password=<voucher_pass>`
- [ ] Router memberikan status login sukses.
- [ ] Jika gagal, tampilkan fallback tombol "Buka Login Manual".

---

## 8. Checklist Integrasi tunnel.web.id (Opsional)

## 8.1 Keamanan Tunnel
- [ ] Set `TUNNEL_BASE_URL` di Worker.
- [ ] Set `TUNNEL_SHARED_KEY` di Worker secret.
- [ ] Implementasi HMAC + timestamp di Worker.
- [ ] Endpoint tunnel memvalidasi HMAC + anti replay 5 menit.

## 8.2 Endpoint Tunnel
- [ ] `POST /routeros/voucher/create`
- [ ] `POST /routeros/voucher/revoke`
- [ ] `GET /routeros/health`
- [ ] Semua endpoint return JSON konsisten `success`, `data`, `error`.

## 8.3 Mapping Paket -> Profile RouterOS
- [ ] Kolom `packages.profile_name` sudah diisi sesuai profile hotspot MikroTik.
- [ ] Tunnel membuat user hotspot pada profile yang tepat.
- [ ] Untuk paket durasi, set `limit-uptime` dari `packages.limit_uptime`.

## 8.4 Observability
- [ ] Simpan log request id dari Worker ke DB (`transactions.note` atau log table terpisah).
- [ ] Simpan error detail tunnel minimal: waktu, endpoint, status code, pesan.
- [ ] Sediakan endpoint health untuk monitoring manual.

---

## 9. Variabel Environment Final

### 9.1 Cloudflare Workers Secrets
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_KEY` (service role)
- `MIKROTIK_GATEWAY_IP` (contoh `192.168.88.1`, dipakai frontend via endpoint config)
- `TUNNEL_BASE_URL` (opsional)
- `TUNNEL_SHARED_KEY` (opsional)

### 9.2 Frontend Config
- `API_URL` -> domain Worker
- `MIKROTIK_GATEWAY_IP` -> IP gateway hotspot lokal

---

## 10. Acceptance Test (Go-Live)

- [ ] Register student baru berhasil dan wallet otomatis terbuat.
- [ ] Topup pending muncul di admin.
- [ ] Admin confirm topup menambah balance.
- [ ] Buy voucher mengurangi saldo dengan benar.
- [ ] Worker sukses klaim voucher dari `voucher_pool`.
- [ ] Tombol `Aktifkan Internet` login otomatis ke hotspot tanpa input manual.
- [ ] Admin bisa revoke voucher.
- [ ] Tidak ada endpoint admin yang bisa diakses role student.
- [ ] Walled garden hanya membuka domain yang diperlukan.

---

## 11. Catatan Implementasi Penting

- `password_hash` saat ini sebaiknya migrasi ke bcrypt/argon2 (bukan sha256 biasa) untuk produksi.
- Proses `buy-voucher` wajib dibuat benar-benar atomic (gunakan idempotency key + kompensasi jika tunnel gagal).
- Simpan plain password voucher seminimal mungkin di UI; tampilkan hanya saat dibutuhkan.
- Untuk UX paling simpel: setelah response `buy-voucher` sukses, langsung render tombol utama `Aktifkan Internet`.

