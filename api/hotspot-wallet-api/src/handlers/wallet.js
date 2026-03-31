/**
 * Handler wallet.
 */

import { verifyJWT, getBearerToken } from '../utils/jwt.js';
import {
  getWalletByUserId,
  createTopup,
  createTransaction,
  getUserTransactions,
  uploadProofImage
} from '../utils/supabase.js';
import { buildPendingTopupMessage, sendTelegramNotification } from '../utils/telegram.js';

const MAX_PROOF_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_PROOF_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeExtFromType(mimeType = '') {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  return map[mimeType] || 'bin';
}

function buildProofObjectPath(userId, mimeType) {
  const ext = normalizeExtFromType(mimeType);
  return `${userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
}

function getAuthPayload(request, secret) {
  const token = getBearerToken(request);
  return verifyJWT(token, secret);
}

export async function handleGetWallet(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
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
    const payload = await getAuthPayload(request, env.JWT_SECRET);
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

    if (method === 'manual_transfer' && !proof_image_url) {
      return jsonResponse({ error: 'Bukti transfer wajib untuk metode manual transfer' }, 400);
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

    if (topup[0]?.status === 'pending') {
      const message = buildPendingTopupMessage({
        userEmail: payload.email,
        amount: topup[0].amount,
        method: topup[0].method,
        status: topup[0].status,
        adminPanelUrl: env.TELEGRAM_ADMIN_PANEL_URL
      });

      try {
        const notifyResult = await sendTelegramNotification(env, message);
        if (notifyResult?.skipped) {
          console.log('telegram notify skipped', notifyResult.reason);
        }
      } catch (notifyError) {
        console.error('telegram notify failed', notifyError?.message || notifyError);
      }
    }

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

export async function handleUploadProof(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonResponse({ error: 'Format upload tidak valid. Gunakan multipart/form-data.' }, 400);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return jsonResponse({ error: 'File bukti wajib diisi' }, 400);
    }

    if (!ALLOWED_PROOF_TYPES.has(file.type)) {
      return jsonResponse({ error: 'Tipe file tidak didukung. Gunakan JPG/PNG/WebP.' }, 400);
    }

    if (file.size > MAX_PROOF_FILE_SIZE) {
      return jsonResponse({ error: 'Ukuran file terlalu besar (maksimal 2MB).' }, 400);
    }

    const objectPath = buildProofObjectPath(payload.sub, file.type);
    const bytes = await file.arrayBuffer();
    const uploaded = await uploadProofImage(
      {
        objectPath,
        contentType: file.type,
        bytes
      },
      env
    );

    return jsonResponse(
      {
        message: 'Bukti transfer berhasil diupload',
        proof_image_url: uploaded.public_url,
        proof_object_path: uploaded.object_path
      },
      201
    );
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleTransactions(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
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
