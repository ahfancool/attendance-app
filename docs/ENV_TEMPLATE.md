# ENV Template

## Cloudflare Worker Secrets

- JWT_SECRET=
- SUPABASE_URL=
- SUPABASE_KEY=
- TELEGRAM_BOT_TOKEN= (opsional, untuk notifikasi topup pending)
- TELEGRAM_CHAT_ID= (opsional, chat ID admin/grup tujuan notifikasi)

## Cloudflare Worker Vars (wrangler.jsonc)

- CORS_ORIGIN=https://<username>.github.io
- TELEGRAM_ADMIN_PANEL_URL=https://ahfancool.github.io/attendance-app/#/admin (opsional)

## Frontend (frontend/js/config.js)

- API_URL=https://hotspot-wallet-api.<subdomain>.workers.dev
- MIKROTIK_GATEWAY_IP=192.168.88.1

## Opsional (jika nanti kembali ke realtime RouterOS via tunnel)

- TUNNEL_BASE_URL=
- TUNNEL_SHARED_KEY=
- TUNNEL_API_KEY=
- MIKROTIK_SERVER=hotspot1
- MIKROTIK_MODE=mock (gunakan `live` jika tunnel sinkronisasi router sudah aktif)
- MIKROTIK_SYNC_PROFILE=harian (opsional, default profile untuk sync pool -> router)
