/**
 * Cloudflare Workers - Router Utama
 * Sistem Dompet Koin & Voucher Hotspot
 */

import { handleRegister, handleLogin, handleMe } from './handlers/auth.js';
import {
  handleGetWallet,
  handleTopup,
  handleTransactions,
  handleUploadProof
} from './handlers/wallet.js';
import {
  handleGetPackages,
  handleBuyVoucher,
  handleMyVouchers,
  handleUseVoucher,
  handleConfirmVoucherUse
} from './handlers/voucher.js';
import {
  handleAdminUsers,
  handleAdminTopups,
  handleConfirmTopup,
  handleRevokeVoucher,
  handleAdminImportVoucherPool,
  handleAdminSyncVoucherPoolToRouter,
  handleAdminMaintenancePurge
} from './handlers/admin.js';

const defaultCorsOrigin = '*';

function getCorsOrigin(env) {
  return env.CORS_ORIGIN || defaultCorsOrigin;
}

function buildCorsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(env),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };
}

function handleCORS(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: buildCorsHeaders(env)
    });
  }
  return null;
}

function addCORS(response, env) {
  const newHeaders = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(env);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    newHeaders.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    headers: newHeaders
  });
}

export default {
  async fetch(request, env) {
    const corsResponse = handleCORS(request, env);
    if (corsResponse) return corsResponse;

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/register' && request.method === 'POST') {
        return addCORS(await handleRegister(request, env), env);
      }

      if (path === '/api/login' && request.method === 'POST') {
        return addCORS(await handleLogin(request, env), env);
      }

      if (path === '/api/me' && request.method === 'GET') {
        return addCORS(await handleMe(request, env), env);
      }

      if (path === '/api/wallet' && request.method === 'GET') {
        return addCORS(await handleGetWallet(request, env), env);
      }

      if (path === '/api/topup' && request.method === 'POST') {
        return addCORS(await handleTopup(request, env), env);
      }

      if (path === '/api/upload-proof' && request.method === 'POST') {
        return addCORS(await handleUploadProof(request, env), env);
      }

      if (path === '/api/transactions' && request.method === 'GET') {
        return addCORS(await handleTransactions(request, env), env);
      }

      if (path === '/api/packages' && request.method === 'GET') {
        return addCORS(await handleGetPackages(request, env), env);
      }

      if (path === '/api/buy-voucher' && request.method === 'POST') {
        return addCORS(await handleBuyVoucher(request, env), env);
      }

      if (path === '/api/use-voucher' && request.method === 'POST') {
        return addCORS(await handleUseVoucher(request, env), env);
      }

      if (path === '/api/confirm-voucher-use' && request.method === 'POST') {
        return addCORS(await handleConfirmVoucherUse(request, env), env);
      }

      if (path === '/api/my-vouchers' && request.method === 'GET') {
        return addCORS(await handleMyVouchers(request, env), env);
      }

      if (path === '/api/admin/users' && request.method === 'GET') {
        return addCORS(await handleAdminUsers(request, env), env);
      }

      if (path === '/api/admin/topups' && request.method === 'GET') {
        return addCORS(await handleAdminTopups(request, env), env);
      }

      if (path === '/api/admin/topup/confirm' && request.method === 'POST') {
        return addCORS(await handleConfirmTopup(request, env), env);
      }

      if (path === '/api/admin/revoke-voucher' && request.method === 'POST') {
        return addCORS(await handleRevokeVoucher(request, env), env);
      }

      if (path === '/api/admin/voucher-pool/import' && request.method === 'POST') {
        return addCORS(await handleAdminImportVoucherPool(request, env), env);
      }

      if (path === '/api/admin/voucher-pool/sync-router' && request.method === 'POST') {
        return addCORS(await handleAdminSyncVoucherPoolToRouter(request, env), env);
      }

      if (path === '/api/admin/maintenance/purge' && request.method === 'POST') {
        return addCORS(await handleAdminMaintenancePurge(request, env), env);
      }

      return addCORS(
        new Response(JSON.stringify({ error: 'Endpoint tidak ditemukan' }), {
          status: 404,
          headers: buildCorsHeaders(env)
        }),
        env
      );
    } catch (error) {
      return addCORS(
        new Response(
          JSON.stringify({
            error: 'Internal Server Error',
            detail: error.message
          }),
          {
            status: 500,
            headers: buildCorsHeaders(env)
          }
        ),
        env
      );
    }
  }
};
