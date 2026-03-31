import { captureHotspotContext, getHotspotHintText } from '../config.js';
import { buildConnectUrl } from '../voucher.js';

const usernameEl = document.getElementById('voucher-username-preview');
const passwordEl = document.getElementById('voucher-password-preview');
const gatewayHintEl = document.getElementById('gateway-hint');
const statusHintEl = document.getElementById('status-hint');
const continueButtonEl = document.getElementById('continue-hotspot-login');

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
  const connectUrl = buildConnectUrl(username, password, { callbackUrl });

  continueButtonEl.addEventListener('click', () => {
    window.location.assign(connectUrl);
  });
}

bootstrap();
