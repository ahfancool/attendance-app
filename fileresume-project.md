# File Resume Project (Checkpoint Terkini)

Update terakhir: 2026-04-01 (Asia/Jakarta)  
Tujuan file: acuan cepat + detail teknis untuk AI agent lain agar bisa lanjut kerja tanpa kehilangan konteks.

## 1) Snapshot Proyek

- Nama proyek: `hotspot-wallet-v2` (menggantikan scaffold attendance lama).
- Model operasional aktif: **pre-generate voucher dari Mikhmon -> import ke `voucher_pool` -> aplikasi hanya klaim dari pool**.
- Integrasi realtime RouterOS via API tunnel **tidak dipakai** pada mode produksi saat ini.
- Target utama UX: user beli paket lalu klik tombol `Pakai Hari` (tanpa input manual username/password hotspot).

## 2) Arsitektur Produksi Aktif

- Frontend: GitHub Pages  
  URL: `https://ahfancool.github.io/attendance-app/`
- Backend API: Cloudflare Worker  
  URL: `https://hotspot-wallet-api.ahfancool.workers.dev`
- Database + Storage: Supabase (PostgreSQL + bucket bukti transfer)
- Router: MikroTik RouterOS v6 (hotspot lokal)

## 3) Status Fitur Utama (Sudah Jalan)

### Sisi siswa

- Register/Login.
- Dashboard paket internet + pembelian voucher.
- Paket bundle hari:
  - nominal 1000 => 1 voucher harian
  - nominal 5000 => 5 voucher harian
  - nominal 25000 => 25 voucher harian
- Render tombol `Pakai Hari N` per voucher:
  - belum dipakai: tombol aktif
  - sudah dipakai: tombol disable
  - jika bundle habis: card lenyap (karena query hanya tampilkan `remaining > 0`)
- Aktivasi voucher:
  - `POST /api/use-voucher` hanya validasi + keluarkan `activation_token`
  - login hotspot dilakukan frontend
  - setelah callback kembali ke app, frontend panggil `POST /api/confirm-voucher-use`
  - voucher baru ditandai `used` jika callback konfirmasi sukses
- Sponsor/ads:
  - tombol pakai voucher menjalankan delay 5 detik
  - mencoba membuka link ads acak dari `frontend/js/ads.js`
  - lalu redirect login hotspot
- Wallet/topup:
  - metode `manual_transfer` dan `qris_static`
  - upload bukti transfer gambar (jpg/png/webp, max 2MB)
  - `manual_transfer` wajib bukti
  - QRIS statis ditampilkan di halaman wallet (asset lokal `frontend/assets/qris_statis.jpeg`)
  - setelah topup `pending` dibuat, Worker kirim notifikasi Telegram (jika secret Telegram terisi)

### Sisi admin

- Lihat ringkasan users + pending topup.
- Tabel topup dengan kolom bukti (`Lihat Bukti`).
- Confirm/reject topup.
- Saat confirm topup:
  - saldo wallet user bertambah
  - transaksi topup dibuat sukses
  - file bukti di storage dihapus
  - `proof_image_url` di DB di-clear (`null`)
- Revoke voucher (status aplikasi jadi `revoked`; disable user di router tetap manual dari Mikhmon/RouterOS).
- Import voucher pool dari CSV:
  - endpoint: `POST /api/admin/voucher-pool/import`
  - auto deteksi delimiter (`,` `;` `tab`)
  - dukung file dengan/ tanpa header
  - duplicate username dalam file/DB di-skip
- Maintenance purge data (admin one-click):
  - topup + transaksi final lebih dari 30 hari dihapus
  - voucher `used/revoked` lebih dari 10 hari dihapus
  - `voucher_pool` status `sold` lebih dari 10 hari dihapus

## 4) Perbaikan Terakhir (Penting)

Commit terbaru: `99d2291`  
Judul: `Avoid HTTPS to HTTP form warning in hotspot assist flow`

Masalah sebelumnya:
- klik `Pakai Hari` memunculkan tab blank (`about:blank`), lalu login hotspot sering tidak lanjut (terutama browser lama/VM).

Perbaikan:
- alur pre-open `about:blank` dihapus.
- tetap delay 5 detik + eksekusi ads.
- tambah fallback redirect hotspot di `connectVoucher`.

Update lanjutan (2026-03-31):
- alur `Pakai Hari` diarahkan ke halaman perantara `hotspot-login.html` (credential voucher dibawa via query URL-encoded).
- user klik tombol `Buka Login Hotspot` untuk lanjut ke URL login hotspot yang sudah terisi.
- file `hotspot/login.html` di MikroTik diubah ke redirect script yang mengirim `link-login-only`, `link-login`, dan context hotspot ke aplikasi.

Update perbaikan susulan (2026-03-31):
- `hotspot/login.html` di MikroTik diubah menjadi mode bridge:
  - jika ada query `username/password`: auto submit login ke `$(link-login-only)`
  - jika belum ada credential: redirect ke app wallet.
- tombol `Buka Login Hotspot` di `hotspot-login.page.js` menggunakan redirect GET ke URL login berisi credential, lalu submit login diproses di sisi MikroTik (context HTTP lokal), agar tidak muncul warning submit form HTTPS -> HTTP.
- profile hotspot `hsprof1` diset `login-by=cookie,http-pap` (chap dimatikan untuk kompatibilitas flow POST credential).

Update produksi penuh (2026-03-31):
- Data dummy Supabase dibersihkan:
  - `voucher_pool` source `seed_sql` dihapus
  - akun uji `coba@gmail.com` dihapus
  - tabel `vouchers` dan `transactions` kembali bersih dari data test.
- User hotspot dummy di MikroTik dibersihkan, menyisakan baseline bawaan (`default-trial`, `admin`).
- Ditambahkan script one-click sinkronisasi pool produksi:
  - `docs/sync_voucher_pool_to_mikrotik.ps1` (otomatis abaikan source `seed_sql`)
  - panduan operasional: `docs/PRODUKSI_FULL_CHECKLIST.md`.
- Ditambahkan UI admin untuk sync pool ke router:
  - endpoint backend: `POST /api/admin/voucher-pool/sync-router`
  - panel admin: tombol `Sync ke MikroTik` + `Download Script .rsc` fallback jika tunnel live belum aktif.
- Ditambahkan notifikasi Telegram topup pending:
  - helper baru: `api/hotspot-wallet-api/src/utils/telegram.js`
  - trigger: `POST /api/topup` (best-effort non-blocking)
  - setup: `docs/TELEGRAM_NOTIF_SETUP.md`
- Ditambahkan endpoint maintenance purge:
  - `POST /api/admin/maintenance/purge`
  - UI: panel `Pembersihan Data (Purge)` di `admin.html`.

File terdampak:
- `frontend/js/pages/dashboard.page.js`
- `frontend/js/voucher.js`
- `frontend/hotspot-login.html`
- `frontend/js/pages/hotspot-login.page.js`

## 5) Endpoint API (Aktif di Kode Saat Ini)

### Auth
- `POST /api/register`
- `POST /api/login`
- `GET /api/me`

### Wallet
- `GET /api/wallet`
- `POST /api/topup`
- `POST /api/upload-proof`
- `GET /api/transactions`

### Voucher
- `GET /api/packages`
- `POST /api/buy-voucher`
- `POST /api/use-voucher`
- `POST /api/confirm-voucher-use`
- `GET /api/my-vouchers`

### Admin
- `GET /api/admin/users`
- `GET /api/admin/topups`
- `POST /api/admin/topup/confirm`
- `POST /api/admin/revoke-voucher`
- `POST /api/admin/voucher-pool/import`
- `POST /api/admin/maintenance/purge`

Router endpoint optional via tunnel (realtime create/revoke) saat ini tidak dipakai oleh flow produksi.

## 6) Struktur Database Final (Referensi Utama)

Sumber schema: `docs/sql_v2_schema.sql`

Tabel inti:
- `users`
- `wallets`
- `packages`
- `voucher_pool`
- `topups`
- `vouchers`
- `transactions`
- `idempotency_keys`

Status penting:
- `voucher_pool.status`: `available | reserved | sold | invalid`
- `vouchers.status`: `assigned | used | expired | revoked`
- `topups.status`: `pending | confirmed | rejected`

Fungsi SQL penting:
- `claim_pool_voucher(p_package_id uuid)` (atomic claim, `FOR UPDATE SKIP LOCKED`)
- `mark_pool_voucher_sold(...)`
- `release_pool_voucher(...)`

## 7) Konfigurasi Deploy dan Environment

### Frontend (GitHub Pages)
- Workflow: `.github/workflows/deploy-pages.yml`
- Trigger: push ke `main` untuk path `frontend/**`
- Artifact deploy: folder `./frontend`

### Worker
- Config: `api/hotspot-wallet-api/wrangler.jsonc`
- Vars non-secret saat ini:
  - `CORS_ORIGIN`
  - `TUNNEL_TIMEOUT_MS`
  - `TUNNEL_MAX_RETRIES`

### Secrets (wajib di Worker, jangan commit plaintext)
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- opsional:
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
  - `TELEGRAM_ADMIN_PANEL_URL` (var non-secret)
  - `PROOF_BUCKET` (default `payment-proofs`)
  - `TUNNEL_BASE_URL`, `TUNNEL_SHARED_KEY`, `TUNNEL_API_KEY`, `MIKROTIK_SERVER` (hanya jika balik ke realtime tunnel mode)

### Hardening DB (2026-04-01)
- RLS sudah diaktifkan pada:
  - `public.voucher_pool`
  - `public.idempotency_keys`
- Privilege `anon` dan `authenticated` ke dua tabel di atas sudah dicabut.
- Policy eksplisit `service_role` sudah ditambahkan:
  - `voucher_pool_service_role_all`
  - `idempotency_service_role_all`
- SQL hardening tersimpan di:
  - `docs/sql_rls_hardening_public_tables.sql`

## 8) RouterOS / Hotspot Integrasi

- Login hotspot frontend berbasis:
  - tangkap `link-login-only` jika query dari captive portal tersedia, atau
  - fallback ke `http://192.168.88.1/login`
- Hint login base ditampilkan di dashboard siswa (`Gateway login terdeteksi: ...`).

Script final RB450GX ROS6 tersedia di lokal (di luar repo ini):
- `C:\Projects\mikrotik_rb450gx_ros6_hotspotwallet_final.rsc`
- mirror: `C:\Projects\hotspot-wallet-v2\docs\mikrotik_rb450gx_ros6_hotspotwallet_final.rsc`

Catatan: script `.rsc` tidak berada di repo `_repo_attendance_app`.

## 9) Riwayat Commit Penting (ringkas)

- `99d2291` hindari warning submit HTTPS->HTTP pada hotspot assist flow
- `c5a07f5` fix login hotspot assist via submit credential yang stabil
- `1053154` tambah halaman perantara login hotspot manual
- `540e6d6` fix alur pakai voucher agar tidak macet karena blank popup
- `be72a19` ads delay 5 detik saat pakai voucher
- `f574f97` callback confirm voucher-use (mark used setelah callback)
- `67504f4` daily bundle voucher (1/5/25 hari)
- `71d2f16` admin CSV import voucher + tampilan QRIS siswa
- `e241494` upload bukti bayar + admin lihat bukti + cleanup saat confirm
- `97bbb23` perbaikan query relasi topups/users di admin
- `368b817` workflow GitHub Pages
- `fd05a8b` replace attendance scaffold -> hotspot wallet v2

## 10) Known Issues / Risiko Terbuka

- Uji hotspot dari klien VM/browsers lama tetap perlu verifikasi lapangan berkala.
- Jika captive portal redirect tidak membawa `link-login-only`, sistem mengandalkan fallback gateway IP.
- Revoke di aplikasi tidak auto disable user di router (by design untuk mode pool).
- Ads URL bisa diblokir popup blocker; login hotspot tetap harus jadi prioritas.
- Source voucher dummy `seed_sql` tidak boleh dipakai di produksi (script sync produksi otomatis mengabaikan).

## 11) Runbook Cepat untuk Agent Lain

### Jalankan API lokal
1. `cd C:\Projects\_repo_attendance_app`
2. `npm install`
3. `npm run dev:api`

### Deploy API
1. `cd C:\Projects\_repo_attendance_app`
2. `npm run deploy:api`

### Deploy Frontend
1. Push perubahan ke `main` pada folder `frontend/**`
2. Tunggu GitHub Actions Pages selesai

### SQL penting
- fresh install: `docs/sql_v2_schema.sql`
- migrasi ke pool mode: `docs/sql_v2_pool_migration.sql`
- seed/admin cepat: `docs/sql_quick_admin_and_seed.sql`

### Sinkronisasi produksi voucher -> MikroTik
1. Jalankan `docs/sync_voucher_pool_to_mikrotik.ps1`
2. Ikuti panduan `docs/PRODUKSI_FULL_CHECKLIST.md`

## 12) Guardrail Operasional (Wajib Diingat)

- Jangan mengubah mode menjadi realtime RouterOS create/delete kecuali diminta eksplisit.
- Jangan commit secret/token/key ke git.
- Untuk bug `Pakai Hari`, cek selalu:
  - respons `POST /api/use-voucher`
  - URL hotspot yang dibentuk frontend
  - callback `hw_login=1` lalu `POST /api/confirm-voucher-use`
  - state `vouchers.status` di DB (`assigned` -> `used`)
