# Setup Notifikasi Telegram (Topup Pending)

Dokumen ini untuk mengaktifkan notifikasi Telegram saat ada request topup baru (`status=pending`).

## 1. Buat Bot Telegram

1. Buka Telegram.
2. Chat ke `@BotFather`.
3. Jalankan `/newbot`.
4. Simpan token bot (`TELEGRAM_BOT_TOKEN`).

## 2. Ambil Chat ID Admin

1. Kirim minimal 1 pesan ke bot (dari akun admin/grup admin).
2. Buka URL:

```text
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getUpdates
```

3. Cari nilai `chat.id` dari pesan terakhir.
4. Simpan sebagai `TELEGRAM_CHAT_ID`.

## 3. Isi Secret di Cloudflare Worker

Jalankan dari folder:

```powershell
cd C:\Projects\_repo_attendance_app\api\hotspot-wallet-api
```

Lalu:

```powershell
wrangler secret put TELEGRAM_BOT_TOKEN
wrangler secret put TELEGRAM_CHAT_ID
```

Opsional (link panel admin yang dikirim di pesan):

```powershell
wrangler deploy --var TELEGRAM_ADMIN_PANEL_URL:https://ahfancool.github.io/attendance-app/#/admin
```

## 4. Alur Kerja di Kode

- Endpoint `POST /api/topup` membuat row `topups` status `pending`.
- Setelah insert berhasil, Worker akan memanggil Telegram Bot API `sendMessage`.
- Jika Telegram gagal, topup **tetap sukses** (non-blocking) dan error dicatat di log Worker.

## 5. Uji Cepat

1. Login sebagai user siswa.
2. Ajukan topup dari aplikasi.
3. Cek Telegram admin: harus muncul notifikasi dalam beberapa detik.
4. Jika tidak muncul, cek log Worker untuk pesan `telegram notify failed`.
