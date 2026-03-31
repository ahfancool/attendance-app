# Checklist Mode Produksi Penuh

Dokumen ini dipakai setelah fase testing selesai.

## 1. Target Final

- Tidak ada data dummy `seed_sql` di Supabase.
- Tidak ada user hotspot dummy/testing di MikroTik.
- Voucher aktif hanya berasal dari batch real (Mikhmon/CSV produksi).
- Sinkronisasi voucher pool ke MikroTik bisa dijalankan one-click.

## 2. Validasi Supabase

Pastikan query ini menghasilkan `0`:

```sql
select count(*) as dummy_pool
from public.voucher_pool
where source = 'seed_sql';
```

Opsional bersih total data testing siswa:

```sql
delete from public.users where email = 'coba@gmail.com';
```

## 3. Validasi MikroTik

Pastikan hotspot user tidak mengandung dummy seed:

```routeros
/ip hotspot user print where comment~"seed_sql"
```

Pastikan profile hotspot untuk flow voucher:

```routeros
/ip hotspot profile print detail where name="hsprof1"
```

Nilai minimum yang harus ada:
- `login-by=cookie,http-pap`

## 4. Sinkronisasi Voucher Pool Produksi ke MikroTik

Jalankan script:

`docs/sync_voucher_pool_to_mikrotik.ps1`

Alternatif tanpa CLI:

- Buka panel admin web -> section **Sync Voucher Pool ke MikroTik**
- Klik tombol **Sync ke MikroTik**
- Jika tunnel live belum aktif, tombol **Download Script .rsc** akan muncul untuk import via Winbox.

Contoh:

```powershell
powershell -ExecutionPolicy Bypass -File .\docs\sync_voucher_pool_to_mikrotik.ps1 `
  -SupabaseUrl "https://<project-ref>.supabase.co" `
  -SupabaseServiceKey "<service-role-key>" `
  -MikrotikHost "10.196.17.190" `
  -MikrotikUser "admin" `
  -MikrotikPassword "<password-router>" `
  -MikrotikHostKey "ssh-rsa 2048 SHA256:<fingerprint>" `
  -HotspotProfile "harian" `
  -OutputDir ".\tmp"
```

Script akan:
- Ambil `voucher_pool` dengan status `available/reserved/sold`
- Abaikan source `seed_sql`
- Upsert user hotspot ke profile `harian`
- Upload + import `.rsc` ke MikroTik

## 5. Uji Akhir

1. User siswa topup + beli voucher.
2. Klik `Pakai Hari`.
3. Klik `Buka Login Hotspot`.
4. Verifikasi:

```routeros
/ip hotspot active print
/log print where message~"logged in|login failed"
```

Jika ada `login failed: invalid username or password`, cek sinkronisasi voucher pool ke router.
