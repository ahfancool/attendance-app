# ENV Template

## Cloudflare Worker Secrets

- JWT_SECRET=
- SUPABASE_URL=
- SUPABASE_KEY=

## Cloudflare Worker Vars (wrangler.jsonc)

- CORS_ORIGIN=https://<username>.github.io

## Frontend (frontend/js/config.js)

- API_URL=https://hotspot-wallet-api.<subdomain>.workers.dev
- MIKROTIK_GATEWAY_IP=192.168.88.1

## Opsional (jika nanti kembali ke realtime RouterOS via tunnel)

- TUNNEL_BASE_URL=
- TUNNEL_SHARED_KEY=
- TUNNEL_API_KEY=
- MIKROTIK_SERVER=hotspot1
