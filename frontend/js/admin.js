import { apiRequest } from './auth.js';

export async function getAdminTopups() {
  return apiRequest('/api/admin/topups');
}

export async function getAdminUsers() {
  return apiRequest('/api/admin/users');
}

export async function confirmTopup(topupId, action = 'confirm') {
  return apiRequest('/api/admin/topup/confirm', {
    method: 'POST',
    body: JSON.stringify({ topup_id: topupId, action })
  });
}

export async function revokeVoucher(voucherUsername) {
  return apiRequest('/api/admin/revoke-voucher', {
    method: 'POST',
    body: JSON.stringify({ voucher_username: voucherUsername })
  });
}

export async function getPackagesForAdmin() {
  return apiRequest('/api/packages');
}

export async function importVoucherPoolCsv(payload) {
  return apiRequest('/api/admin/voucher-pool/import', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function syncVoucherPoolToRouter(payload = {}) {
  return apiRequest('/api/admin/voucher-pool/sync-router', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}
