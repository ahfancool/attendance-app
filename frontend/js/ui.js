const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0
});

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', { hour12: false });
}

export function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function setButtonBusy(button, busy, busyText = 'Memproses...') {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    return;
  }

  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
}

function ensureToastContainer() {
  let container = document.getElementById('toast-stack');
  if (container) return container;

  container = document.createElement('div');
  container.id = 'toast-stack';
  container.className = 'toast-stack';
  document.body.appendChild(container);
  return container;
}

export function showToast(message, type = 'info', timeoutMs = 3200) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-hide');
    setTimeout(() => toast.remove(), 220);
  }, timeoutMs);
}

export function statusLabel(status) {
  const map = {
    pending: 'Menunggu',
    success: 'Berhasil',
    failed: 'Gagal',
    cancelled: 'Dibatalkan',
    assigned: 'Siap Dipakai',
    used: 'Terpakai',
    expired: 'Kadaluarsa',
    revoked: 'Dicabut',
    confirmed: 'Terkonfirmasi',
    rejected: 'Ditolak'
  };

  return map[status] || status || '-';
}
