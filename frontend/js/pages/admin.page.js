import { logout, requireAuth } from '../auth.js';
import {
  confirmTopup,
  getAdminTopups,
  getAdminUsers,
  getPackagesForAdmin,
  importVoucherPoolCsv,
  revokeVoucher,
  syncVoucherPoolToRouter
} from '../admin.js';
import { escapeHtml, formatCurrency, formatDate, setButtonBusy, showToast, statusLabel } from '../ui.js';

const userNameEl = document.getElementById('user-name');
const summaryUsersEl = document.getElementById('summary-users');
const summaryPendingEl = document.getElementById('summary-pending');
const topupsBodyEl = document.getElementById('topups-body');
const refreshButtonEl = document.getElementById('refresh-admin');
const revokeFormEl = document.getElementById('revoke-form');

const importFormEl = document.getElementById('import-voucher-form');
const importPackageEl = document.getElementById('import-package');
const importBatchEl = document.getElementById('import-batch');
const importCsvEl = document.getElementById('import-csv');
const importSummaryEl = document.getElementById('import-summary');
const syncFormEl = document.getElementById('sync-router-form');
const syncProfileEl = document.getElementById('sync-profile');
const syncSummaryEl = document.getElementById('sync-summary');
const downloadSyncRscEl = document.getElementById('download-sync-rsc');

const state = {
  topups: [],
  users: [],
  usersById: new Map(),
  packages: [],
  latestSyncScript: null,
  latestSyncFilename: null
};

function renderSummary() {
  summaryUsersEl.textContent = `${state.users.length} user`;
  const pendingCount = state.topups.filter((item) => item.status === 'pending').length;
  summaryPendingEl.textContent = `${pendingCount} topup pending`;
}

function renderPackageOptions() {
  const options = ['<option value="">Pilih paket...</option>'];
  state.packages.forEach((pkg) => {
    options.push(
      `<option value="${escapeHtml(pkg.id)}">${escapeHtml(pkg.name)} - ${formatCurrency(pkg.price)}</option>`
    );
  });
  importPackageEl.innerHTML = options.join('');
}

function buildActionButtons(item) {
  if (item.status !== 'pending') {
    return '<span class="muted">-</span>';
  }

  return `
    <div class="actions">
      <button class="btn btn-soft" data-action="confirm" data-id="${item.id}">Confirm</button>
      <button class="btn btn-danger" data-action="reject" data-id="${item.id}">Reject</button>
    </div>
  `;
}

function buildProofCell(item) {
  if (!item.proof_image_url) {
    return '<span class="muted">Tidak ada</span>';
  }

  const safeUrl = escapeHtml(item.proof_image_url);
  return `<a class="btn btn-soft" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Lihat Bukti</a>`;
}

function renderTopupsTable() {
  if (!state.topups.length) {
    topupsBodyEl.innerHTML = '<tr><td colspan="7">Belum ada data topup.</td></tr>';
    return;
  }

  topupsBodyEl.innerHTML = state.topups
    .map(
      (item) => `
        <tr>
          <td>${formatDate(item.created_at)}</td>
          <td>${state.usersById.get(item.user_id)?.name || item.user_id}</td>
          <td>${formatCurrency(item.amount)}</td>
          <td>${item.method}</td>
          <td>${buildProofCell(item)}</td>
          <td>${statusLabel(item.status)}</td>
          <td>${buildActionButtons(item)}</td>
        </tr>
      `
    )
    .join('');

  topupsBodyEl.querySelectorAll('button[data-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = button.dataset.action;
      const topupId = button.dataset.id;
      const busyText = action === 'confirm' ? 'Confirming...' : 'Rejecting...';

      setButtonBusy(button, true, busyText);

      try {
        const result = await confirmTopup(topupId, action);
        showToast(result.message || `Topup berhasil di-${action === 'confirm' ? 'confirm' : 'reject'}`, 'success');
        if (result.warning) {
          showToast(result.warning, 'error', 4600);
        }
        await refreshData();
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        setButtonBusy(button, false);
      }
    });
  });
}

async function refreshData() {
  const [topupRes, usersRes] = await Promise.all([getAdminTopups(), getAdminUsers()]);
  state.topups = topupRes.topups || [];
  state.users = usersRes.users || [];
  state.usersById = new Map(state.users.map((user) => [user.id, user]));

  renderSummary();
  renderTopupsTable();
}

async function refreshPackages() {
  const packageRes = await getPackagesForAdmin();
  state.packages = packageRes.packages || [];
  renderPackageOptions();
}

function renderImportSummary(result) {
  importSummaryEl.innerHTML = `
    <div class="meta"><span>Paket</span><strong>${escapeHtml(result.package?.name || '-')}</strong></div>
    <div class="meta"><span>Baris Dibaca</span><strong>${result.requested_rows}</strong></div>
    <div class="meta"><span>Berhasil Masuk Pool</span><strong>${result.inserted_rows}</strong></div>
    <div class="meta"><span>Dilewati</span><strong>${result.skipped_rows}</strong></div>
    <div class="meta"><span>Duplikat (DB)</span><strong>${result.skipped_duplicate_in_database}</strong></div>
  `;
}

function triggerDownload(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'sync_pool_to_mikrotik.rsc';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function renderSyncSummary(result) {
  syncSummaryEl.innerHTML = `
    <div class="meta"><span>Mode</span><strong>${escapeHtml(result.mode || '-')}</strong></div>
    <div class="meta"><span>Total Row</span><strong>${result.rows_total ?? 0}</strong></div>
    <div class="meta"><span>Profile</span><strong>${escapeHtml(result.profile_name || '-')}</strong></div>
    <div class="meta"><span>Synced</span><strong>${result.synced_rows ?? 0}</strong></div>
    <div class="meta"><span>Existing</span><strong>${result.existing_rows ?? 0}</strong></div>
    <div class="meta"><span>Failed</span><strong>${result.failed_rows ?? 0}</strong></div>
  `;
}

async function onImportVoucherSubmit(event) {
  event.preventDefault();
  const submitButton = importFormEl.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Mengimpor voucher...');
  importSummaryEl.textContent = '';

  try {
    const packageId = importPackageEl.value;
    const csvFile = importCsvEl.files?.[0] || null;

    if (!packageId) {
      throw new Error('Pilih paket terlebih dahulu');
    }
    if (!csvFile) {
      throw new Error('File CSV wajib dipilih');
    }

    const csvText = await csvFile.text();
    const batchCode = importBatchEl.value.trim() || null;

    const result = await importVoucherPoolCsv({
      package_id: packageId,
      csv_text: csvText,
      batch_code: batchCode
    });

    renderImportSummary(result);
    showToast(result.message || 'Import voucher selesai', 'success', 4200);
    importCsvEl.value = '';
  } catch (error) {
    showToast(error.message, 'error', 4200);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function onRevokeSubmit(event) {
  event.preventDefault();
  const input = document.getElementById('voucher-username');
  const submitButton = revokeFormEl.querySelector('button[type="submit"]');

  setButtonBusy(submitButton, true, 'Memproses revoke...');

  try {
    const username = input.value.trim();
    if (!username) {
      throw new Error('Username voucher wajib diisi');
    }

    const result = await revokeVoucher(username);
    showToast(result.message || 'Voucher berhasil direvoke', 'success');
    revokeFormEl.reset();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function onSyncRouterSubmit(event) {
  event.preventDefault();
  const submitButton = syncFormEl.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Sinkronisasi...');
  downloadSyncRscEl.classList.add('hidden');

  try {
    const profileName = syncProfileEl.value.trim() || 'harian';
    const result = await syncVoucherPoolToRouter({
      profile_name: profileName
    });

    renderSyncSummary(result);

    state.latestSyncScript = result.script_content || null;
    state.latestSyncFilename = result.script_filename || 'sync_pool_to_mikrotik.rsc';

    if (state.latestSyncScript) {
      downloadSyncRscEl.classList.remove('hidden');
    }

    showToast(result.message || 'Sinkronisasi selesai', 'success', 4500);
  } catch (error) {
    showToast(error.message, 'error', 4600);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function bootstrap() {
  const me = await requireAuth({ adminOnly: true });
  userNameEl.textContent = me.user?.name || 'Admin';

  document.getElementById('logout-btn').addEventListener('click', logout);
  refreshButtonEl.addEventListener('click', () => {
    refreshData()
      .then(() => showToast('Data admin diperbarui', 'success'))
      .catch((error) => showToast(error.message, 'error'));
  });

  revokeFormEl.addEventListener('submit', onRevokeSubmit);
  importFormEl.addEventListener('submit', onImportVoucherSubmit);
  syncFormEl.addEventListener('submit', onSyncRouterSubmit);
  downloadSyncRscEl.addEventListener('click', () => {
    if (!state.latestSyncScript) {
      showToast('Belum ada script sync yang tersedia', 'error');
      return;
    }
    triggerDownload(state.latestSyncFilename, state.latestSyncScript);
  });

  await Promise.all([refreshData(), refreshPackages()]);
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat panel admin', 'error', 4200);
});
