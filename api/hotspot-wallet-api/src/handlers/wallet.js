/**
 * Handler wallet.
 */

import { verifyJWT, getBearerToken } from '../utils/jwt.js';
import {
  getWalletByUserId,
  createTopup,
  createTransaction,
  getUserTransactions
} from '../utils/supabase.js';

export async function handleGetWallet(request, env) {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const wallet = await getWalletByUserId(payload.sub, env);

    return jsonResponse({
      balance: wallet ? wallet.balance : 0,
      updated_at: wallet ? wallet.updated_at : null
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleTopup(request, env) {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const { amount, method, proof_image_url } = body;

    if (!amount || amount <= 0) {
      return jsonResponse({ error: 'Jumlah topup harus lebih dari 0' }, 400);
    }

    if (!method || !['manual_transfer', 'qris_static'].includes(method)) {
      return jsonResponse({ error: 'Metode topup tidak valid' }, 400);
    }

    const topup = await createTopup(
      {
        user_id: payload.sub,
        amount,
        method,
        proof_image_url: proof_image_url || null,
        status: 'pending'
      },
      env
    );

    await createTransaction(
      {
        user_id: payload.sub,
        type: 'topup',
        amount,
        reference_type: 'topup',
        reference_id: topup[0].id,
        status: 'pending'
      },
      env
    );

    return jsonResponse(
      {
        message: 'Permintaan topup berhasil diajukan',
        topup: {
          id: topup[0].id,
          amount: topup[0].amount,
          method: topup[0].method,
          status: topup[0].status,
          created_at: topup[0].created_at
        }
      },
      201
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleTransactions(request, env) {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const transactions = await getUserTransactions(payload.sub, env);

    return jsonResponse({
      transactions: transactions || []
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
