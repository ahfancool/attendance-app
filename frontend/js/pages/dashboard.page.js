import { captureHotspotContext, getHotspotHintText } from '../config.js';
import { requireAuth, logout } from '../auth.js';
import { buyVoucher, connectVoucher, getMyVouchers, getPackages, useVoucher } from '../voucher.js';
import { escapeHtml, formatCurrency, formatDate, setButtonBusy, showToast } from '../ui.js';

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

function getBundleKey(voucher) {
  const bundleId = String(voucher.router_user_id || '').trim();
  if (bundleId) return bundleId;
  return `legacy-${voucher.id}`;
}

function buildVoucherBundles(vouchers) {
  const map = new Map();

  vouchers.forEach((voucher) => {
    const key = getBundleKey(voucher);
    if (!map.has(key)) {
      map.set(key, {
        key,
        packageName: voucher.packages?.name || voucher.package_name || 'Voucher Harian',
        duration: voucher.packages?.duration || voucher.duration || '24 jam',
        createdAt: voucher.created_at,
        vouchers: []
      });
    }
    map.get(key).vouchers.push(voucher);
  });

  return Array.from(map.values())
    .map((bundle) => {
      const ordered = [...bundle.vouchers].sort((a, b) => {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const usedCount = ordered.filter((item) => item.status !== 'assigned').length;
      const total = ordered.length;
      return {
        ...bundle,
        vouchers: ordered,
        usedCount,
        total,
        remaining: total - usedCount
      };
    })
    .filter((bundle) => bundle.remaining > 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function onUseVoucher(voucher, button) {
  setButtonBusy(button, true, 'Mengaktifkan...');

  try {
    const result = await useVoucher(voucher.id);
    const target = state.vouchers.find((item) => item.id === voucher.id);
    if (target) {
      target.status = 'used';
      target.activated_at = new Date().toISOString();
    }

    renderVouchers();
    showToast('Voucher aktif. Menghubungkan ke hotspot...', 'success', 2600);

    setTimeout(() => {
      connectVoucher(result.voucher.username, result.voucher.password);
    }, 650);
  } catch (error) {
    showToast(error.message, 'error', 4200);
    setButtonBusy(button, false);
  }
}

function createBundleCard(bundle) {
  const card = document.createElement('article');
  card.className = 'voucher-card';

  card.innerHTML = `
    <div class="meta">
      <strong>${escapeHtml(bundle.packageName)}</strong>
      <span class="pill">${escapeHtml(`${bundle.remaining}/${bundle.total} hari tersisa`)}</span>
    </div>
    <small>Dibeli: ${escapeHtml(formatDate(bundle.createdAt))}</small>
    <small>Durasi voucher: ${escapeHtml(bundle.duration || '24 jam')}</small>
  `;

  const actions = document.createElement('div');
  actions.className = 'actions';

  bundle.vouchers.forEach((voucher, index) => {
    const dayNumber = index + 1;
    const isUsed = voucher.status !== 'assigned';
    const button = document.createElement('button');
    button.className = isUsed ? 'btn btn-soft' : 'btn';
    button.disabled = isUsed;
    button.textContent = isUsed ? `Hari ${dayNumber} (Terpakai)` : `Pakai Hari ${dayNumber}`;

    if (!isUsed) {
      button.addEventListener('click', () => onUseVoucher(voucher, button));
    }

    actions.appendChild(button);
  });

  card.appendChild(actions);
  return card;
}

function renderVouchers() {
  voucherGridEl.innerHTML = '';
  const bundles = buildVoucherBundles(state.vouchers);

  if (!bundles.length) {
    voucherGridEl.innerHTML =
      '<div class="empty">Belum ada jatah hari aktif. Beli paket dulu, lalu gunakan tombol hari di sini.</div>';
    return;
  }

  bundles.forEach((bundle) => {
    voucherGridEl.appendChild(createBundleCard(bundle));
  });
}

async function handleBuyPackage(pkg, button) {
  setButtonBusy(button, true, 'Membeli paket...');

  try {
    const result = await buyVoucher(pkg.id);
    state.me.wallet.balance = result.remaining_balance;
    state.vouchers = [...(result.vouchers || []), ...state.vouchers];

    renderTopSection();
    renderVouchers();
    showToast('Paket berhasil dibeli. Pilih tombol hari pada Voucher Saya.', 'success', 3500);
  } catch (error) {
    showToast(error.message, 'error', 4200);
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
  buyButton.textContent = 'Beli Paket';
  buyButton.addEventListener('click', () => handleBuyPackage(pkg, buyButton));

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
    reloadData()
      .then(() => showToast('Data dashboard diperbarui', 'success'))
      .catch((error) => {
        showToast(error.message, 'error');
      });
  });

  document.getElementById('logout-btn').addEventListener('click', logout);
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat dashboard', 'error', 4200);
});

