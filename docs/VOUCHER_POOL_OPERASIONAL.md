# Operasional Voucher Pool (Mode Pre-Generate Mikhmon)

Dokumen ini untuk workflow harian admin agar stok voucher selalu tersedia.

## 1. Prinsip

- Voucher dibuat dulu di Mikhmon/RouterOS.
- Data voucher diimport ke tabel `voucher_pool` status `available`.
- Saat user beli voucher, Worker otomatis ambil 1 baris dari pool secara atomic.
- Jika stok habis, endpoint `/api/buy-voucher` akan mengembalikan `409 Stok voucher habis`.

## 2. Struktur Data Import

Kolom minimal:
- `package_id`
- `username`
- `password`

Kolom opsional:
- `source` (default: `mikhmon`)
- `batch_code` (contoh: `BATCH-2026-03-29-A`)
- `generated_at`

## 3. Contoh Insert Manual

```sql
insert into public.voucher_pool (
  package_id,
  username,
  password,
  source,
  batch_code
)
values
  ('<uuid-package-1h>', 'V1AB2CD', '8K7LMNPQ', 'mikhmon', 'BATCH-2026-03-29-A'),
  ('<uuid-package-1h>', 'V1AB2CE', '8K7LMNPR', 'mikhmon', 'BATCH-2026-03-29-A'),
  ('<uuid-package-2h>', 'V1AB2CF', '8K7LMNPS', 'mikhmon', 'BATCH-2026-03-29-A');
```

## 4. Contoh Import CSV via Supabase SQL

1. Upload CSV ke editor/import tool Supabase.
2. Mapping kolom ke `voucher_pool`.
3. Set nilai default `status = available`.

Contoh format CSV:

```csv
package_id,username,password,source,batch_code
<uuid-package-1h>,V1AB2CD,8K7LMNPQ,mikhmon,BATCH-2026-03-29-A
<uuid-package-1h>,V1AB2CE,8K7LMNPR,mikhmon,BATCH-2026-03-29-A
```

## 5. Query Monitoring Stok

```sql
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
```

## 6. SOP Saat Stok Habis

1. Generate batch baru di Mikhmon.
2. Import ke `voucher_pool` dengan `batch_code` baru.
3. Jalankan query monitoring stok.
4. Lakukan test pembelian 1 voucher dari akun uji.

## 7. Catatan Revoke

Mode pool tidak otomatis disable user di RouterOS saat admin klik revoke.
Jika perlu block langsung di router, lakukan dari Mikhmon/RouterOS manual.
