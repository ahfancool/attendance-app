import { captureHotspotContext, getHotspotHintText, getHotspotLoginBase } from '../config.js';

const usernameEl = document.getElementById('voucher-username-preview');
const passwordEl = document.getElementById('voucher-password-preview');
const gatewayHintEl = document.getElementById('gateway-hint');
const statusHintEl = document.getElementById('status-hint');
const continueButtonEl = document.getElementById('continue-hotspot-login');

function getHotspotLoginUrl() {
  const raw = getHotspotLoginBase();
  let loginUrl;

  try {
    loginUrl = new URL(raw);
  } catch {
    loginUrl = new URL('http://192.168.88.1/login');
  }

  if (!loginUrl.pathname || loginUrl.pathname === '/') {
    loginUrl.pathname = '/login';
  }

  loginUrl.search = '';
  loginUrl.hash = '';

  return loginUrl.toString();
}

function submitLoginForm(username, password, callbackUrl) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = getHotspotLoginUrl();
  form.style.display = 'none';

  const append = (name, value) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  };

  append('username', username);
  append('password', password);
  if (callbackUrl) {
    append('dst', callbackUrl);
  }

  document.body.appendChild(form);
  form.submit();
}

function readParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    username: (params.get('u') || '').trim(),
    password: (params.get('p') || '').trim(),
    callbackUrl: (params.get('cb') || '').trim()
  };
}

function renderError(message) {
  statusHintEl.textContent = message;
  continueButtonEl.disabled = true;
  continueButtonEl.classList.add('btn-soft');
}

function bootstrap() {
  captureHotspotContext();
  gatewayHintEl.textContent = getHotspotHintText();

  const { username, password, callbackUrl } = readParams();
  if (!username || !password) {
    renderError('Data voucher tidak lengkap. Silakan ulang dari Dashboard.');
    return;
  }

  usernameEl.value = username;
  passwordEl.value = password;
  statusHintEl.textContent = 'Jika tombol tidak bekerja, refresh halaman ini lalu klik kembali.';

  continueButtonEl.addEventListener('click', () => {
    submitLoginForm(username, password, callbackUrl);
  });
}

bootstrap();
