# Panduan Admin Hotspot Wallet

Dokumen ini menjelaskan fitur yang tersedia di menu **Admin** (`/frontend/admin.html`) dan cara pakainya.

## 1. Akses Halaman Admin

1. Login dengan akun yang role-nya `admin`.
2. Buka menu **Admin** di navbar.
3. Jika token login valid dan role bukan admin, sistem akan menolak akses (`Admin only`).

## 2. Ringkasan Admin

Di bagian atas halaman ada 2 kartu:

- **Admin Login**: menampilkan nama admin yang sedang login.
- **Ringkasan**:
  - `Total User`: jumlah user yang terdaftar.
  - `Menunggu Verifikasi`: jumlah topup dengan status `pending`.

Tombol **Refresh** di panel Daftar Topup akan memuat ulang data topup + user.

## 3. Daftar Topup (Verifikasi Pembayaran)

Panel ini adalah pusat verifikasi topup user.

Kolom tabel:

- **Waktu**
- **User**
- **Nominal**
- **Metode** (`manual_transfer` atau `qris_static`)
- **Bukti**
  - Jika ada bukti transfer, tombol **Lihat Bukti** muncul.
  - Jika tidak ada, tampil `Tidak ada`.
- **Status** (`pending`, `confirmed`, `rejected`)
- **Aksi**

Cara pakai:

1. Klik **Lihat Bukti** untuk cek bukti transfer (khusus yang upload bukti).
2. Jika pembayaran valid, klik **Confirm**.
3. Jika tidak valid, klik **Reject**.

Efek tombol **Confirm**:

- Status topup berubah jadi `confirmed`.
- Saldo wallet user bertambah sesuai nominal.
- Riwayat transaksi topup dicatat `success`.
- Jika ada file bukti, sistem mencoba hapus file dari Storage dan mengosongkan `proof_image_url` agar storage tidak cepat penuh.

Efek tombol **Reject**:

- Status topup jadi `rejected`.
- Saldo tidak berubah.

## 4. Import Voucher Pool (CSV)

Fitur ini dipakai untuk memasukkan voucher pre-generate (misalnya dari Mikhmon) ke database `voucher_pool`.

Field:

- **Paket Voucher**: pilih paket target.
- **Kode Batch (opsional)**: penanda import (contoh: `MIKHMON-20260331-A`).
- **File CSV Voucher**: file `.csv`.

Format CSV yang didukung:

- Header boleh ada atau tidak.
- Delimiter bisa **koma**, **semicolon**, atau **tab**.
- Minimal kolom username dan password.
- Contoh:

```csv
username,password
ABC123,pass001
ABC124,pass002
```

Catatan validasi:

- Maksimum 3000 baris per sekali import.
- Baris kosong/tidak valid akan dilewati.
- Duplikat dalam file akan dilewati.
- Duplikat terhadap data yang sudah ada di DB juga dilewati.

Setelah import selesai, sistem menampilkan ringkasan:

- `Baris Dibaca`
- `Berhasil Masuk Pool`
- `Dilewati`
- `Duplikat (DB)`

## 5. Sync Voucher Pool ke MikroTik

Fitur ini menyinkronkan voucher dari `voucher_pool` ke user hotspot MikroTik.

Field:

- **Profile Hotspot Router**: default `harian`.

Cara pakai:

1. Pastikan voucher pool sudah terisi (hasil import CSV).
2. Isi profile router (umumnya tetap `harian`).
3. Klik **Sync ke MikroTik**.

Hasil sync:

- Jika tunnel live belum aktif, sistem tetap memberikan script `.rsc`.
  - Tombol **Download Script .rsc** akan muncul.
  - Import manual via Winbox/Terminal.
- Jika tunnel live aktif, sistem mencoba sync langsung ke MikroTik.

Ringkasan yang ditampilkan:

- `Mode` (`script_only` atau `tunnel_sync`)
- `Total Row`
- `Profile`
- `Synced`
- `Existing`
- `Failed`

Data yang disinkronkan dari pool:

- Source selain `seed_sql`.
- Status `available`, `reserved`, `sold`.

## 6. Revoke Voucher

Fitur untuk mencabut voucher di sisi aplikasi.

Cara pakai:

1. Isi **Username Voucher**.
2. Klik **Revoke Voucher**.

Efek:

- Status voucher di tabel `vouchers` diubah menjadi `revoked`.
- Untuk disable user langsung di RouterOS, tetap lakukan dari Mikhmon/Winbox bila dibutuhkan.

## 7. SOP Harian Admin (Disarankan)

1. Buka menu **Admin**.
2. Klik **Refresh**.
3. Cek topup `pending`, verifikasi bukti, lalu **Confirm/Reject**.
4. Jika stok voucher menipis, lakukan **Import Voucher Pool (CSV)**.
5. Jalankan **Sync Voucher Pool ke MikroTik**.
6. Gunakan **Revoke Voucher** jika ada voucher yang harus dicabut.

## 8. Pembersihan Data (Purge)

Menu ini dipakai untuk menjaga database Supabase Free Plan tetap ringan.

Policy bawaan (sekali klik):

- `topups` status final (`confirmed/rejected`) yang lebih lama dari **30 hari** akan dihapus.
- `transactions` status final (`success/failed/cancelled`) yang lebih lama dari **30 hari** akan dihapus.
- `vouchers` status `used/revoked` yang lebih lama dari **10 hari** akan dihapus.
- `voucher_pool` status `sold` yang lebih lama dari **10 hari** akan dihapus.

Cara pakai:

1. Buka panel **Pembersihan Data (Purge)**.
2. Klik **Jalankan Purge Sekarang**.
3. Cek ringkasan hasil hapus pada panel.

Saran operasional:

- Jalankan minimal 1x per minggu.
- Jalankan juga setelah event besar (banyak transaksi/topup).

## 9. Troubleshooting Cepat

- **Topup tidak bisa confirm karena bukti tidak ada**
  - Metode `manual_transfer` memang wajib bukti upload.
- **Sync hasilnya `rows_total = 0`**
  - `voucher_pool` masih kosong, lakukan import CSV dulu.
- **Sync banyak `failed`**
  - Cek koneksi tunnel/live config, dan cek apakah username/password voucher valid.
- **User tidak bisa akses menu admin**
  - Pastikan akun role `admin`.
