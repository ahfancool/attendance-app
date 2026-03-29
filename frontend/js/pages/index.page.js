import { captureHotspotContext, getHotspotHintText } from '../config.js';
import { getToken, fetchMe, login, register } from '../auth.js';
import { setButtonBusy, showToast } from '../ui.js';

const loginTab = document.getElementById('tab-login');
const registerTab = document.getElementById('tab-register');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const statusText = document.getElementById('auth-status');
const hotspotHint = document.getElementById('hotspot-hint');

function setStatus(message, isError = false) {
  statusText.textContent = message || '';
  statusText.classList.remove('status-success', 'status-error');
  if (!message) return;
  statusText.classList.add(isError ? 'status-error' : 'status-success');
}

function switchTab(mode) {
  const loginMode = mode === 'login';
  loginTab.classList.toggle('active', loginMode);
  registerTab.classList.toggle('active', !loginMode);
  loginForm.classList.toggle('hidden', !loginMode);
  registerForm.classList.toggle('hidden', loginMode);
  setStatus('');
}

async function redirectIfAlreadyLoggedIn() {
  const token = getToken();
  if (!token) return;

  try {
    await fetchMe();
    window.location.href = './dashboard.html';
  } catch {
    // biarkan user login ulang
  }
}

function applyMessageFromQuery() {
  const msg = new URLSearchParams(window.location.search).get('msg');
  if (!msg) return;
  setStatus(msg, false);
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Masuk...');
  setStatus('');

  try {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    await login(email, password);
    showToast('Login berhasil', 'success');
    window.location.href = './dashboard.html';
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function onRegisterSubmit(event) {
  event.preventDefault();
  const submitButton = registerForm.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Membuat akun...');
  setStatus('');

  try {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    await register(name, email, password);
    await login(email, password);

    showToast('Akun berhasil dibuat', 'success');
    window.location.href = './dashboard.html';
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

function bootstrap() {
  captureHotspotContext();
  hotspotHint.textContent = getHotspotHintText();

  applyMessageFromQuery();
  redirectIfAlreadyLoggedIn();

  loginTab.addEventListener('click', () => switchTab('login'));
  registerTab.addEventListener('click', () => switchTab('register'));

  loginForm.addEventListener('submit', onLoginSubmit);
  registerForm.addEventListener('submit', onRegisterSubmit);
}

bootstrap();
