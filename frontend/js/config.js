const LOGIN_BASE_STORAGE_KEY = 'hw_hotspot_login_base';

export const CONFIG = {
  APP_NAME: 'Hotspot Wallet Sekolah',
  API_URL: 'https://hotspot-wallet-api.ahfancool.workers.dev',
  MIKROTIK_GATEWAY_IP: '192.168.88.1',
  MIKROTIK_LOGIN_URL: ''
};

function safeDecode(value) {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractLoginFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const candidates = [
    params.get('link-login-only'),
    params.get('link-login'),
    params.get('login_url')
  ]
    .map((x) => safeDecode(x || '').trim())
    .filter(Boolean);

  return candidates.find((candidate) => /^https?:\/\//i.test(candidate)) || '';
}

export function captureHotspotContext() {
  const fromQuery = extractLoginFromQuery();
  if (!fromQuery) return;

  try {
    sessionStorage.setItem(LOGIN_BASE_STORAGE_KEY, fromQuery);
  } catch {
    // ignore write failure in restricted browser mode
  }
}

export function getHotspotLoginBase() {
  captureHotspotContext();

  const fromQuery = extractLoginFromQuery();
  if (fromQuery) return fromQuery;

  const fromStorage = sessionStorage.getItem(LOGIN_BASE_STORAGE_KEY);
  if (fromStorage) return fromStorage;

  if (CONFIG.MIKROTIK_LOGIN_URL && /^https?:\/\//i.test(CONFIG.MIKROTIK_LOGIN_URL)) {
    return CONFIG.MIKROTIK_LOGIN_URL;
  }

  return `http://${CONFIG.MIKROTIK_GATEWAY_IP}/login`;
}

export function getHotspotHintText() {
  const base = getHotspotLoginBase();
  return `Gateway login terdeteksi: ${base}`;
}
