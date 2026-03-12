Project Resume: Sistem Dompet Koin & Voucher Hotspot

1. Gambaran Umum

Sistem ini bertujuan mengintegrasikan hotspot MikroTik (yang dikelola dengan Mikhmon) dengan sebuah aplikasi web yang berfungsi seperti dompet digital. Siswa dapat melakukan top up koin, lalu menggunakan koin tersebut untuk membeli voucher hotspot.

Website berfungsi sebagai portal pengguna untuk:

Login akun

Melihat saldo koin

Top up koin

Membeli voucher hotspot

Melihat riwayat transaksi

Mengunduh / mencetak voucher dalam bentuk PDF


Arsitektur sistem menggunakan stack gratis berbasis JAMstack.

Frontend: GitHub Pages Backend API: Cloudflare Workers Database: Supabase


---

2. Tujuan Sistem

1. Mempermudah distribusi voucher hotspot untuk siswa.


2. Menyediakan sistem saldo koin seperti dompet digital.


3. Menyediakan riwayat transaksi yang transparan.


4. Mengurangi proses manual pembuatan dan distribusi voucher.




---

3. Arsitektur Sistem

User (Siswa) terhubung ke WiFi hotspot sekolah.

Karena belum login hotspot, siswa akan diarahkan ke Hotspot Login Page MikroTik.

Login page ini dimodifikasi agar memiliki:

form login hotspot

link menuju Portal Voucher / Wallet System


Agar portal tersebut bisa diakses tanpa login hotspot, domain sistem harus dimasukkan ke MikroTik Walled Garden.

Alur koneksi:

User Device | v WiFi Hotspot MikroTik | v Hotspot Login Page (custom) | +----> Portal Wallet System (Walled Garden Access) | v Frontend (GitHub Pages) | v API (Cloudflare Workers) | v Database (Supabase) | v MikroTik Router / Mikhmon

Frontend hanya berisi halaman statis dan JavaScript. Semua proses bisnis dilakukan melalui API.


---

4. Komponen Sistem

4.1 Frontend

Hosting: GitHub Pages

Fungsi:

Login dan registrasi pengguna

Dashboard saldo

Halaman top up koin

Pembelian voucher

Riwayat transaksi

Generate dan download PDF voucher


Teknologi yang dapat digunakan:

HTML

CSS

JavaScript

Framework opsional (Vue / React / Svelte)



---

4.2 Backend API

Platform: Cloudflare Workers

Fungsi API:

Autentikasi pengguna

Manajemen saldo koin

Proses pembelian voucher

Integrasi ke sistem Mikhmon / MikroTik

Generate data voucher

Penyimpanan riwayat transaksi


Endpoint contoh:

POST /login POST /topup POST /buy-voucher GET /transactions GET /voucher/{id}


---

4.3 Database

Platform: Supabase

Database digunakan untuk menyimpan:

Tables:

users

wallets

transactions

vouchers

topups


Contoh struktur sederhana:

users

id

name

email

password_hash


wallets

user_id

balance


transactions

id

user_id

type

amount

created_at


vouchers

id

code

price

status



---

4.4 Sistem Hotspot

Router: MikroTik Voucher Manager: Mikhmon

Fungsi:

Generate voucher hotspot

Mengatur masa aktif dan kuota


Integrasi dapat dilakukan dengan:

RouterOS API

atau sinkronisasi data voucher dari Mikhmon



---

5. Fitur Sistem

5.1 Akun Pengguna

Pengguna dapat:

registrasi

login

melihat saldo



---

5.2 Dompet Koin

Fitur:

top up koin

saldo tersimpan di database


Saldo digunakan untuk membeli voucher.


---

5.3 Pembelian Voucher

Proses:

1. user memilih paket voucher


2. sistem cek saldo


3. saldo dipotong


4. voucher diberikan


5. transaksi disimpan




---

5.4 Riwayat Transaksi

User dapat melihat:

riwayat pembelian voucher

riwayat top up



---

5.5 Cetak Voucher

Voucher dapat:

ditampilkan di halaman

diunduh sebagai PDF


Isi voucher:

username

password

masa aktif

paket



---

6. Flow Sistem

6.1 Flow Akses Awal

1. Siswa connect ke WiFi hotspot.


2. Browser diarahkan ke Hotspot Login Page MikroTik.


3. Login page menyediakan link menuju Portal Voucher.


4. Domain portal sudah dimasukkan ke MikroTik Walled Garden sehingga dapat diakses tanpa login hotspot.



6.2 Flow Pembelian Voucher

1. User membuka portal wallet.


2. User login ke akun sistem.


3. User melihat saldo koin.


4. Jika perlu user melakukan top up.


5. User memilih paket voucher.


6. Sistem mengecek saldo wallet.


7. Jika saldo cukup:

saldo dipotong

sistem membuat voucher pada MikroTik

data voucher disimpan di database



8. Sistem menampilkan daftar voucher milik user dalam bentuk tombol (voucher list).


9. User menekan tombol voucher yang ingin digunakan.


10. Sistem mengirim kredensial voucher (username dan password) ke halaman login hotspot secara otomatis.


11. User langsung terautentikasi ke hotspot tanpa perlu kembali mengetik username/password secara manual.



Tujuan desain ini adalah menyederhanakan pengalaman pengguna sehingga siswa cukup:

1. connect WiFi


2. buka portal voucher


3. beli voucher


4. tekan tombol voucher


5. langsung online



Dengan pendekatan ini, siswa tidak perlu kembali ke halaman login hotspot dan tidak perlu mengetik kredensial voucher.


---

7. Keunggulan Arsitektur

Tidak membutuhkan server hosting berbayar

Skalabel untuk jumlah user sekolah

Mudah dideploy

Mudah dikembangkan



---

8. Pengembangan Selanjutnya

Potensi pengembangan:

sistem admin panel

dashboard monitoring penggunaan hotspot

integrasi pembayaran (QRIS / ewallet)

sistem referral atau bonus koin



---

9. Target Pengguna

Pengguna utama:

siswa sekolah


Pengelola:

admin jaringan

operator hotspot



---

10. Ringkasan

Sistem ini merupakan platform web untuk membeli voucher hotspot menggunakan sistem koin digital. Sistem dibangun menggunakan stack gratis berbasis JAMstack dan terintegrasi dengan MikroTik hotspot melalui Mikhmon.


---

11. Database Schema (Draft)

users

id (uuid)

name

email

password_hash

created_at


wallets

id (uuid)

user_id (uuid)

balance (integer)

updated_at


transactions

id (uuid)

user_id (uuid)

type (topup | purchase)

amount (integer)

reference_id

created_at


vouchers

id (uuid)

user_id (uuid)

code

password

package

price

created_at


packages

id

name

duration

price



---

12. API Specification (Draft)

Auth POST /api/register POST /api/login GET /api/me

Wallet GET /api/wallet POST /api/topup

Voucher GET /api/packages POST /api/buy-voucher GET /api/my-vouchers GET /api/voucher/{id}

Transactions GET /api/transactions

Admin (future) POST /api/admin/generate-voucher GET /api/admin/users


---

13. Voucher Generation Flow

1. User memilih paket voucher


2. Frontend mengirim request ke API


3. API mengecek saldo wallet


4. Jika saldo cukup:

saldo dikurangi

voucher dibuat melalui MikroTik API / Mikhmon



5. Data voucher disimpan di database


6. Voucher dikirim kembali ke frontend


7. User dapat download PDF voucher




---

14. Struktur Folder Project

frontend/

index.html

login.html

dashboard.html

wallet.html

vouchers.html

js/

css/


api/

auth.js

wallet.js

voucher.js

transaction.js


worker/

index.js



---

15. Integrasi MikroTik

Router: MikroTik Voucher Manager: Mikhmon

Karena backend berada di internet (Cloudflare Workers), sedangkan MikroTik berada di jaringan lokal sekolah, diperlukan metode agar API dapat mengakses RouterOS.

Beberapa opsi integrasi:

Opsi 1: VPN Tunnel

Menggunakan layanan seperti tunnel dari tunnel.web.id atau VPN serupa.

Konsep:

Cloudflare Worker | v Public Tunnel / VPN | v Router MikroTik (RouterOS API)

Backend akan memanggil RouterOS API melalui port yang dipublish lewat tunnel.

Langkah umum:

1. Membuat tunnel dari jaringan sekolah ke internet.


2. Membuka port RouterOS API melalui tunnel.


3. Backend mengakses endpoint tersebut.


4. Backend membuat user hotspot / voucher.



Opsi 2: Sinkronisasi Mikhmon

Alternatif yang lebih sederhana:

1. Voucher dibuat oleh Mikhmon.


2. Sistem hanya membaca daftar voucher.


3. Voucher diberikan ke user ketika dibeli.




---

16. Sinkronisasi Status Voucher (Critical Design)

Agar sistem stabil, status voucher antara database sistem dan MikroTik hotspot harus selalu sinkron.

Masalah yang sering terjadi pada sistem hotspot buatan sendiri:

saldo sudah terpotong tetapi voucher gagal dibuat

voucher dibuat tetapi tidak tersimpan di database

voucher sudah habis tetapi masih bisa digunakan

voucher ganda (double creation)


Untuk menghindari masalah tersebut digunakan pendekatan berikut.

16.1 Status Voucher

Setiap voucher di database memiliki status:

created → voucher baru dibuat

assigned → voucher sudah dimiliki user

used → voucher sudah dipakai login

expired → masa aktif habis


Contoh struktur tambahan:

vouchers

id

user_id

username

password

package

price

status

created_at


16.2 Atomic Purchase Flow

Proses pembelian voucher harus dilakukan secara berurutan:

1. cek saldo user


2. buat transaksi database


3. potong saldo wallet


4. buat voucher di MikroTik


5. simpan voucher ke database


6. kembalikan voucher ke frontend



Jika langkah 4 gagal:

transaksi dibatalkan

saldo dikembalikan


Hal ini mencegah kehilangan saldo.

16.3 Re-sync Voucher

Disarankan ada proses sinkronisasi berkala:

sistem mengecek status voucher dari MikroTik

update status voucher di database


Sinkronisasi dapat dilakukan:

via scheduled worker

atau script lokal di server jaringan sekolah


16.4 Reconnect Voucher

Voucher yang masih aktif tetap dapat digunakan kembali.

Di halaman user akan tampil tombol:

CONNECT

USED

EXPIRED


Jika status assigned atau used tetapi masih aktif di MikroTik, tombol CONNECT tetap tersedia sehingga user bisa login ulang tanpa membeli voucher baru.


---

17. Catatan Untuk Pengembangan dengan ChatGPT

Ketika menggunakan ChatGPT untuk membantu coding:

1. Gunakan stack:

Frontend: Vanilla JS

Backend: Cloudflare Workers

Database: Supabase



2. Semua API menggunakan format JSON.


3. Autentikasi menggunakan JWT.


4. Struktur project harus sederhana dan modular.


5. Semua query database menggunakan Supabase client.



Dokumen ini dapat digunakan sebagai referensi utama untuk pengembangan sistem.
