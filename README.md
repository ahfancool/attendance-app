# Hotspot Wallet V2

Project ini dipulihkan ulang setelah file inti sempat hilang.

## Struktur

- `frontend/` aplikasi user/admin (Vanilla HTML/CSS/JS)
- `api/hotspot-wallet-api/` backend Cloudflare Workers
- `docs/` dokumen implementasi dan schema SQL

## Mode Operasional Saat Ini

- Voucher **pre-generate** dari Mikhmon.
- Worker **tidak** membuat voucher realtime ke RouterOS saat user membeli.
- Worker mengambil voucher dari `voucher_pool` di database.

## Mulai Cepat

1. Setup schema DB dari `docs/sql_v2_schema.sql`.
2. Isi secret Worker sesuai `docs/ENV_TEMPLATE.md`.
3. Jika DB sudah terpasang versi lama, jalankan migrasi `docs/sql_v2_pool_migration.sql`.
4. Isi `voucher_pool` sesuai panduan `docs/VOUCHER_POOL_OPERASIONAL.md`.
   Alternatif cepat testing: jalankan `docs/sql_quick_admin_and_seed.sql`.
5. Untuk mode produksi penuh, ikuti `docs/PRODUKSI_FULL_CHECKLIST.md`.
   Sinkronisasi voucher pool ke MikroTik dapat dilakukan via `docs/sync_voucher_pool_to_mikrotik.ps1`.
6. Jalankan API lokal:
   - `cd api/hotspot-wallet-api`
   - `npm install`
   - `npm run dev`
7. Publish frontend ke GitHub Pages.
