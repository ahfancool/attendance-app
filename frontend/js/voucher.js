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

export async function getMyVouchers() {
  return apiRequest('/api/my-vouchers');
}

export function buildConnectUrl(username, password) {
  const rawBase = getHotspotLoginBase();

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

  return loginUrl.toString();
}

export function connectVoucher(username, password) {
  const url = buildConnectUrl(username, password);
  window.location.assign(url);
}

export async function buyAndConnect(packageId) {
  const result = await buyVoucher(packageId);
  connectVoucher(result.voucher.username, result.voucher.password);
  return result;
}
