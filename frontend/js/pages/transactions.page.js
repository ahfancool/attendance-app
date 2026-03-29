import { logout, requireAuth } from '../auth.js';
import { getTransactions } from '../wallet.js';
import { formatCurrency, formatDate, showToast, statusLabel } from '../ui.js';

const userNameEl = document.getElementById('user-name');
const roleBadgeEl = document.getElementById('role-badge');
const adminNavEl = document.getElementById('nav-admin');
const tbodyEl = document.getElementById('transactions-body');
const refreshButtonEl = document.getElementById('refresh-transactions');

function renderRows(items) {
  if (!items.length) {
    tbodyEl.innerHTML = '<tr><td colspan="5">Belum ada transaksi.</td></tr>';
    return;
  }

  tbodyEl.innerHTML = items
    .map((item) => {
      const isMinus = Number(item.amount) < 0;
      const amountClass = isMinus ? 'pill-danger' : '';

      return `
        <tr>
          <td>${formatDate(item.created_at)}</td>
          <td>${item.type}</td>
          <td><span class="pill ${amountClass}">${formatCurrency(item.amount)}</span></td>
          <td>${statusLabel(item.status)}</td>
          <td>${item.note || '-'}</td>
        </tr>
      `;
    })
    .join('');
}

async function refreshData() {
  const trx = await getTransactions();
  renderRows(trx.transactions || []);
}

async function bootstrap() {
  const me = await requireAuth();
  userNameEl.textContent = me.user?.name || '-';
  roleBadgeEl.textContent = me.user?.role === 'admin' ? 'Admin' : 'Siswa';
  roleBadgeEl.classList.toggle('pill-admin', me.user?.role === 'admin');

  if (me.user?.role === 'admin') {
    adminNavEl.classList.remove('hidden');
  }

  document.getElementById('logout-btn').addEventListener('click', logout);
  refreshButtonEl.addEventListener('click', () => {
    refreshData()
      .then(() => showToast('Riwayat diperbarui', 'success'))
      .catch((error) => showToast(error.message, 'error'));
  });

  await refreshData();
}

bootstrap().catch((error) => {
  showToast(error.message || 'Gagal memuat transaksi', 'error', 4200);
});
