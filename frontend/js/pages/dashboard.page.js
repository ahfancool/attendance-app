import { captureHotspotContext, getHotspotHintText } from '../config.js';
import { requireAuth, logout } from '../auth.js';
import { buyVoucher, connectVoucher, getMyVouchers, getPackages } from '../voucher.js';
import { escapeHtml, formatCurrency, formatDate, setButtonBusy, showToast, statusLabel } from '../ui.js';

const userNameEl = document.getElementById('user-name');
const roleBadgeEl = document.getElementById('role-badge');
const balanceEl = document.getElementById('balance-value');
const hotspotHintEl = document.getElementById('hotspot-hint');
const packageGridEl = document.getElementById('packages-grid');
const voucherGridEl = document.getElementById('vouchers-grid');
const refreshButtonEl = document.getElementById('refresh-dashboard');
const adminNavEl = document.getElementById('nav-admin');

const state = {
  me: null,
  packages: [],
  vouchers: []
};

function setRoleBadge(role) {
  roleBadgeEl.textContent = role === 'admin' ? 'Admin' : 'Siswa';
  roleBadgeEl.classList.toggle('pill-admin', role === 'admin');
}

function renderTopSection() {
  userNameEl.textContent = state.me.user?.name || '-';
  setRoleBadge(state.me.user?.role || 'student');
  balanceEl.textContent = formatCurrency(state.me.wallet?.balance || 0);
  hotspotHintEl.textContent = getHotspotHintText();

  if (state.me.user?.role === 'admin') {
    adminNavEl.classList.remove('hidden');
  }
}

async function copyVoucherCredential(voucher) {
  try {
    await navigator.clipboard.writeText(`Username: ${voucher.username}\nPassword: ${voucher.password}`);
    showToast('Kredensial voucher disalin', 'success');
  } catch {
    showToast('Clipboard tidak tersedia di browser ini', 'error');
  }
}

function createVoucherCard(voucher) {
  const card = document.createElement('article');
  card.className = 'voucher-card';

  const statusClass = voucher.status === 'assigned' ? '' : 'pill-danger';

  card.innerHTML = `
    <div class="meta">
      <strong>${escapeHtml(voucher.packages?.name || voucher.package_name || 'Voucher')}</strong>
      <span class="pill ${statusClass}">${escapeHtml(statusLabel(voucher.status || 'assigned'))}</span>
    </div>
    <div class="meta"><span>Username</span><strong>${escapeHtml(voucher.username)}</strong></div>
    <div class="meta"><span>Password</span><strong>${escapeHtml(voucher.password || '-')}</strong></div>
    <small>Dibuat: ${escapeHtml(formatDate(voucher.created_at))}</small>
  `;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const connectButton = document.createElement('button');
  connectButton.className = 'btn';
  connectButton.textContent = 'Jalankan Voucher';
  connectButton.addEventListener('click', () => {
    connectVoucher(voucher.username, voucher.password);
  });

  const copyButton = document.createElement('button');
  copyButton.className = 'btn btn-soft';
  copyButton.textContent = 'Salin Kredensial';
  copyButton.addEventListener('click', () => copyVoucherCredential(voucher));

  actions.append(connectButton, copyButton);
  card.appendChild(actions);

  return card;
}

function renderVouchers() {
  voucherGridEl.innerHTML = '';

  if (!state.vouchers.length) {
    voucherGridEl.innerHTML = '<div class="empty">Belum ada voucher. Pilih paket dan tekan tombol 1 klik.</div>';
    return;
  }

  state.vouchers.forEach((voucher) => {
    voucherGridEl.appendChild(createVoucherCard(voucher));
  });
}

async function handleBuyAndConnect(pkg, button) {
  setButtonBusy(button, true, 'Membeli voucher...');

  try {
    const result = await buyVoucher(pkg.id);

    const newVoucher = {
      ...result.voucher,
      status: 'assigned',
      packages: {
        name: result.voucher.package_name || pkg.name
      }
    };

    state.vouchers = [newVoucher, ...state.vouchers];
    state.me.wallet.balance = result.remaining_balance;

    renderTopSection();
    renderVouchers();

    showToast('Voucher berhasil. Menghubungkan ke internet...', 'success', 2400);

    setTimeout(() => {
      connectVoucher(result.voucher.username, result.voucher.password);
    }, 700);
  } catch (error) {
    showToast(error.message, 'error', 3800);
  } finally {
    setButtonBusy(button, false);
  }
}

function createPackageCard(pkg) {
  const card = document.createElement('article');
  card.className = 'package-card';

  card.innerHTML = `
    <div class="meta">
      <strong>${escapeHtml(pkg.name)}</strong>
      <span class="pill">${escapeHtml(pkg.duration || '-')}</span>
    </div>
    <p class="kicker">${escapeHtml(pkg.description || 'Paket internet siap pakai')}</p>
    <div class="meta">
      <span>Harga</span>
      <strong>${escapeHtml(formatCurrency(pkg.price))}</strong>
    </div>
  `;

  const actions = document.createElement('div');
  actions.className = 'actions';

  const buyButton = document.createElement('button');
  buyButton.className = 'btn';
  buyButton.textContent = 'Beli & Aktifkan (1 Klik)';
  buyButton.addEventListener('click', () => handleBuyAndConnect(pkg, buyButton));

  actions.appendChild(buyButton);
  card.appendChild(actions);

  return card;
}

function renderPackages() {
  packageGridEl.innerHTML = '';

  if (!state.packages.length) {
    packageGridEl.innerHTML = '<div class="empty">Belum ada paket aktif. Tambahkan paket dari database.</div>';
    return;
  }

  state.packages.forEach((pkg) => {
    packageGridEl.appendChild(createPackageCard(pkg));
  });
}

async function reloadData() {
  const [packagesResponse, vouchersResponse] = await Promise.all([getPackages(), getMyVouchers()]);
  state.packages = packagesResponse.packages || [];
  state.vouchers = vouchersResponse.vouchers || [];

  renderPackages();
  renderVouchers();
}

async function bootstrap() {
  captureHotspotContext();

  state.me = await requireAuth();
  renderTopSection();

  await reloadData();

  refreshButtonEl.addEventListener('click', () => {
    reloadData().then(() => showToast('Data dashboard diperbarui', 'success')).catch((error) => {
      showToast(error.message, 'error');
    });
  });

  document.getElementById('logout-btn').addEventListener('click', logout);
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat dashboard', 'error', 4200);
});
