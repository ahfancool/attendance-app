import { getHotspotLoginBase } from './config.js';
import { apiRequest } from './auth.js';

export async function getPackages() {
  return apiRequest('/api/packages');
}

export async function buyVoucher(packageId) {
  return apiRequest('/api/buy-voucher', {
    method: 'POST',
    body: JSON.stringify({ package_id: packageId })
  });
}

export async function useVoucher(voucherId) {
  return apiRequest('/api/use-voucher', {
    method: 'POST',
    body: JSON.stringify({ voucher_id: voucherId })
  });
}

export async function confirmVoucherUse(voucherId, activationToken) {
  return apiRequest('/api/confirm-voucher-use', {
    method: 'POST',
    body: JSON.stringify({
      voucher_id: voucherId,
      activation_token: activationToken
    })
  });
}

export async function getMyVouchers() {
  return apiRequest('/api/my-vouchers');
}

export function buildConnectUrl(username, password, options = {}) {
  const rawBase = getHotspotLoginBase();
  const callbackUrl = options.callbackUrl || '';

  let loginUrl;
  try {
    loginUrl = new URL(rawBase);
  } catch {
    loginUrl = new URL('http://192.168.88.1/login');
  }

  if (!loginUrl.pathname || loginUrl.pathname === '/') {
    loginUrl.pathname = '/login';
  }

  loginUrl.searchParams.set('username', username);
  loginUrl.searchParams.set('password', password);
  if (callbackUrl) {
    loginUrl.searchParams.set('dst', callbackUrl);
  }

  return loginUrl.toString();
}

export function connectVoucher(username, password, options = {}) {
  const url = buildConnectUrl(username, password, options);
  try {
    window.location.href = url;
  } catch {
    try {
      window.location.assign(url);
    } catch {
      window.open(url, '_self');
    }
  }
}

export async function buyAndConnect(packageId) {
  const result = await buyVoucher(packageId);
  const firstVoucher = result.vouchers?.[0];
  if (firstVoucher) {
    connectVoucher(firstVoucher.username, firstVoucher.password);
  }
  return result;
}
