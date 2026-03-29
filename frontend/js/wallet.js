import { apiRequest } from './auth.js';

export async function submitTopup(payload) {
  return apiRequest('/api/topup', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function getWallet() {
  return apiRequest('/api/wallet');
}

export async function getTransactions() {
  return apiRequest('/api/transactions');
}
