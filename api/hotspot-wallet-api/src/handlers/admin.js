/**
 * Handler admin.
 */

import { verifyJWT, getBearerToken } from '../utils/jwt.js';
import {
  getPendingTopups,
  updateTopupStatus,
  updateWalletBalance,
  getWalletByUserId,
  createTransaction,
  getAllUsers,
  getAllTopups,
  updateVoucherStatusByUsername
} from '../utils/supabase.js';

async function requireAdmin(request, env) {
  const token = getBearerToken(request);
  if (!token) {
    return { error: 'Token tidak ditemukan', status: 401 };
  }

  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload) {
    return { error: 'Token tidak valid', status: 401 };
  }

  if (payload.role !== 'admin') {
    return { error: 'Akses ditolak: Admin only', status: 403 };
  }

  return { payload };
}

export async function handleAdminUsers(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const users = await getAllUsers(env);
    return jsonResponse({ users: users || [] });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleAdminTopups(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const topups = await getAllTopups(env);
    return jsonResponse({ topups: topups || [] });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleConfirmTopup(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const body = await request.json();
    const { topup_id, action } = body;

    if (!topup_id || !['confirm', 'reject'].includes(action)) {
      return jsonResponse({ error: 'Parameter tidak valid' }, 400);
    }

    const topups = await getPendingTopups(env);
    const topup = topups.find((t) => t.id === topup_id);

    if (!topup) {
      return jsonResponse({ error: 'Topup tidak ditemukan' }, 404);
    }

    if (action === 'confirm') {
      const wallet = await getWalletByUserId(topup.user_id, env);
      const newBalance = (wallet ? wallet.balance : 0) + topup.amount;

      await updateWalletBalance(topup.user_id, newBalance, env);
      await updateTopupStatus(topup_id, 'confirmed', adminCheck.payload.sub, env);

      await createTransaction(
        {
          user_id: topup.user_id,
          type: 'topup',
          amount: topup.amount,
          reference_type: 'topup',
          reference_id: topup_id,
          status: 'success'
        },
        env
      );

      return jsonResponse({
        message: 'Topup berhasil dikonfirmasi',
        new_balance: newBalance
      });
    }

    await updateTopupStatus(topup_id, 'rejected', adminCheck.payload.sub, env);

    return jsonResponse({
      message: 'Topup ditolak'
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleRevokeVoucher(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const body = await request.json();
    const { voucher_username } = body;

    if (!voucher_username) {
      return jsonResponse({ error: 'Username voucher wajib diisi' }, 400);
    }
    // Mode default V2: pre-generated voucher dari pool.
    // Revoke di aplikasi berarti status voucher dicabut di sistem wallet.
    // Disable di RouterOS dilakukan dari Mikhmon jika diperlukan.

    await updateVoucherStatusByUsername(voucher_username, 'revoked', env);

    return jsonResponse({
      message: `Voucher ${voucher_username} berhasil direvoke`
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
