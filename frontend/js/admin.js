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
