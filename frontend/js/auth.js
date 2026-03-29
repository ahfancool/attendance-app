import { CONFIG } from './config.js';

const TOKEN_KEY = 'hw_token';
const USER_KEY = 'hw_user';

function withApiBase(path) {
  const apiBase = (CONFIG.API_URL || '').trim().replace(/\/$/, '');
  return `${apiBase}${path}`;
}

function parseJsonSafe(response) {
  return response.json().catch(() => ({}));
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function setStoredUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user || null));
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  clearToken();
  localStorage.removeItem(USER_KEY);
}

export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const token = getToken();

  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !headers['X-Idempotency-Key']) {
    const randomKey = `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    headers['X-Idempotency-Key'] = randomKey;
  }

  const response = await fetch(withApiBase(path), {
    ...options,
    headers
  });

  const data = await parseJsonSafe(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }

    const message = data.error || data.detail || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data;
}

export async function login(email, password) {
  const payload = await apiRequest('/api/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });

  setToken(payload.token);
  setStoredUser(payload.user);
  return payload;
}

export async function register(name, email, password) {
  return apiRequest('/api/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}

export async function fetchMe() {
  const data = await apiRequest('/api/me');
  if (data?.user) {
    setStoredUser(data.user);
  }
  return data;
}

export function logout() {
  clearSession();
  window.location.href = './index.html';
}

export async function requireAuth({ adminOnly = false } = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = './index.html?msg=Silakan+login+terlebih+dahulu';
    throw new Error('Unauthorized');
  }

  try {
    const me = await fetchMe();
    if (adminOnly && me.user?.role !== 'admin') {
      window.location.href = './dashboard.html?msg=Akses+admin+ditolak';
      throw new Error('Forbidden');
    }
    return me;
  } catch (error) {
    const message = String(error?.message || '');
    if (adminOnly && message === 'Forbidden') throw error;
    window.location.href = './index.html?msg=Sesi+berakhir,+silakan+login+ulang';
    throw error;
  }
}
