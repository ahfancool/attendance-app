import { requireAuth, logout } from '../auth.js';
import { getTransactions, getWallet, submitTopup } from '../wallet.js';
import { formatCurrency, formatDate, setButtonBusy, showToast, statusLabel } from '../ui.js';

const userNameEl = document.getElementById('user-name');
const roleBadgeEl = document.getElementById('role-badge');
const balanceEl = document.getElementById('wallet-balance');
const adminNavEl = document.getElementById('nav-admin');
const formEl = document.getElementById('topup-form');
const historyEl = document.getElementById('topup-history');
const refreshButtonEl = document.getElementById('refresh-wallet');

let currentUser = null;

function renderIdentity(me) {
  currentUser = me.user;
  userNameEl.textContent = me.user?.name || '-';
  roleBadgeEl.textContent = me.user?.role === 'admin' ? 'Admin' : 'Siswa';
  roleBadgeEl.classList.toggle('pill-admin', me.user?.role === 'admin');

  if (me.user?.role === 'admin') {
    adminNavEl.classList.remove('hidden');
  }
}

function renderBalance(balance) {
  balanceEl.textContent = formatCurrency(balance || 0);
}

function renderTopupHistory(transactions) {
  const topups = transactions.filter((item) => item.type === 'topup');

  if (!topups.length) {
    historyEl.innerHTML = '<div class="empty">Belum ada riwayat topup.</div>';
    return;
  }

  historyEl.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Waktu</th>
            <th>Nominal</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${topups
            .map(
              (item) => `
                <tr>
                  <td>${formatDate(item.created_at)}</td>
                  <td>${formatCurrency(item.amount)}</td>
                  <td>${statusLabel(item.status)}</td>
                </tr>
              `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function attachQuickAmountButtons() {
  document.querySelectorAll('[data-amount]').forEach((button) => {
    button.addEventListener('click', () => {
      const amount = Number(button.dataset.amount || 0);
      document.getElementById('amount').value = amount;
    });
  });
}

async function refreshData() {
  const [walletData, trxData] = await Promise.all([getWallet(), getTransactions()]);
  renderBalance(walletData.balance);
  renderTopupHistory(trxData.transactions || []);
}

async function onTopupSubmit(event) {
  event.preventDefault();
  const submitButton = formEl.querySelector('button[type="submit"]');
  setButtonBusy(submitButton, true, 'Mengirim topup...');

  try {
    const payload = {
      amount: Number(document.getElementById('amount').value),
      method: document.getElementById('method').value,
      proof_image_url: document.getElementById('proof').value.trim() || null
    };

    const result = await submitTopup(payload);
    showToast(`${result.message}. Menunggu konfirmasi admin.`, 'success', 3800);
    formEl.reset();
    await refreshData();
  } catch (error) {
    showToast(error.message, 'error', 4200);
  } finally {
    setButtonBusy(submitButton, false);
  }
}

async function bootstrap() {
  const me = await requireAuth();
  renderIdentity(me);
  renderBalance(me.wallet?.balance || 0);

  attachQuickAmountButtons();
  formEl.addEventListener('submit', onTopupSubmit);

  refreshButtonEl.addEventListener('click', () => {
    refreshData()
      .then(() => showToast('Data wallet diperbarui', 'success'))
      .catch((error) => showToast(error.message, 'error'));
  });

  document.getElementById('logout-btn').addEventListener('click', logout);

  await refreshData();
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat wallet', 'error', 4200);
});
