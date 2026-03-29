import { logout, requireAuth } from '../auth.js';
import { confirmTopup, getAdminTopups, getAdminUsers, revokeVoucher } from '../admin.js';
import { escapeHtml, formatCurrency, formatDate, setButtonBusy, showToast, statusLabel } from '../ui.js';

const userNameEl = document.getElementById('user-name');
const summaryUsersEl = document.getElementById('summary-users');
const summaryPendingEl = document.getElementById('summary-pending');
const topupsBodyEl = document.getElementById('topups-body');
const refreshButtonEl = document.getElementById('refresh-admin');
const revokeFormEl = document.getElementById('revoke-form');

const state = {
  topups: [],
  users: [],
  usersById: new Map()
};

function renderSummary() {
  summaryUsersEl.textContent = `${state.users.length} user`;
  const pendingCount = state.topups.filter((item) => item.status === 'pending').length;
  summaryPendingEl.textContent = `${pendingCount} topup pending`;
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

  await refreshData();
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat panel admin', 'error', 4200);
});
