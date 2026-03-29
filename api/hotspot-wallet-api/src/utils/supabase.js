/**
 * Utility koneksi Supabase REST API
 */

function buildSupabaseBaseUrl(env) {
  const baseUrl = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  if (!baseUrl.startsWith('https://')) {
    throw new Error('SUPABASE_URL tidak valid');
  }
  return baseUrl;
}

function getSupabaseApiKey(env) {
  const apiKey = (env.SUPABASE_KEY || '').trim();
  if (!apiKey) {
    throw new Error('SUPABASE_KEY kosong');
  }
  return apiKey;
}

function getProofBucket(env) {
  return (env.PROOF_BUCKET || 'payment-proofs').trim();
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

async function supabaseRequest(endpoint, options = {}, env) {
  const baseUrl = buildSupabaseBaseUrl(env);
  const url = `${baseUrl}/rest/v1/${endpoint}`;

  const apiKey = getSupabaseApiKey(env);

  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(options.headers || {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorRaw = await response.text().catch(() => '');
    let errorPayload = {};
    try {
      errorPayload = errorRaw ? JSON.parse(errorRaw) : {};
    } catch {
      errorPayload = {};
    }
    const detail =
      errorPayload.message ||
      errorPayload.error_description ||
      errorRaw ||
      `Supabase Error ${response.status}`;
    throw new Error(detail);
  }

  const raw = await response.text().catch(() => '');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getStorageErrorMessage(rawText, status) {
  if (!rawText) {
    return `Supabase Storage Error ${status}`;
  }

  try {
    const payload = JSON.parse(rawText);
    return payload.error || payload.message || rawText;
  } catch {
    return rawText;
  }
}

function formatUploadErrorMessage(rawText, status, bucket) {
  const detail = getStorageErrorMessage(rawText, status);
  if (detail.toLowerCase().includes('bucket not found')) {
    return `Bucket storage "${bucket}" belum ada. Buat bucket public dengan nama "${bucket}" di Supabase Storage.`;
  }
  return detail;
}

export async function uploadProofImage({ objectPath, contentType, bytes }, env) {
  const baseUrl = buildSupabaseBaseUrl(env);
  const apiKey = getSupabaseApiKey(env);
  const bucket = getProofBucket(env);
  const encodedPath = encodeStoragePath(objectPath);
  const uploadUrl = `${baseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'false'
    },
    body: bytes
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(formatUploadErrorMessage(raw, response.status, bucket));
  }

  const publicUrl = `${baseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
  return {
    object_path: objectPath,
    public_url: publicUrl
  };
}

function extractProofObjectPath(proofUrl, bucket) {
  const parsed = new URL(proofUrl);
  const publicPrefix = `/storage/v1/object/public/${bucket}/`;
  const privatePrefix = `/storage/v1/object/${bucket}/`;

  if (parsed.pathname.startsWith(publicPrefix)) {
    return decodeURIComponent(parsed.pathname.slice(publicPrefix.length));
  }

  if (parsed.pathname.startsWith(privatePrefix)) {
    return decodeURIComponent(parsed.pathname.slice(privatePrefix.length));
  }

  throw new Error('Format URL bukti tidak dikenali');
}

export async function deleteProofImageByUrl(proofUrl, env) {
  if (!proofUrl) return { deleted: false };

  const baseUrl = buildSupabaseBaseUrl(env);
  const apiKey = getSupabaseApiKey(env);
  const bucket = getProofBucket(env);
  const objectPath = extractProofObjectPath(proofUrl, bucket);
  const encodedPath = encodeStoragePath(objectPath);
  const deleteUrl = `${baseUrl}/storage/v1/object/${bucket}/${encodedPath}`;

  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`
    }
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    throw new Error(getStorageErrorMessage(raw, response.status));
  }

  return { deleted: true, object_path: objectPath };
}

// USERS
export async function getUserByEmail(email, env) {
  const result = await supabaseRequest(
    `users?email=eq.${encodeURIComponent(email)}&select=*`,
    { method: 'GET' },
    env
  );
  return result[0] || null;
}

export async function getUserById(userId, env) {
  const result = await supabaseRequest(
    `users?id=eq.${userId}&select=*`,
    { method: 'GET' },
    env
  );
  return result[0] || null;
}

export async function createUser(userData, env) {
  return supabaseRequest(
    'users',
    {
      method: 'POST',
      body: JSON.stringify(userData)
    },
    env
  );
}

// WALLETS
export async function getWalletByUserId(userId, env) {
  const result = await supabaseRequest(
    `wallets?user_id=eq.${userId}&select=*`,
    { method: 'GET' },
    env
  );
  return result[0] || null;
}

export async function updateWalletBalance(userId, newBalance, env) {
  return supabaseRequest(
    `wallets?user_id=eq.${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        balance: newBalance,
        updated_at: new Date().toISOString()
      })
    },
    env
  );
}

// PACKAGES
export async function getActivePackages(env) {
  return supabaseRequest('packages?is_active=eq.true&select=*', { method: 'GET' }, env);
}

export async function getPackageById(packageId, env) {
  const result = await supabaseRequest(
    `packages?id=eq.${packageId}&select=*`,
    { method: 'GET' },
    env
  );
  return result[0] || null;
}

// VOUCHER POOL
export async function claimVoucherFromPool(packageId, env) {
  const result = await supabaseRequest(
    'rpc/claim_pool_voucher',
    {
      method: 'POST',
      body: JSON.stringify({
        p_package_id: packageId
      })
    },
    env
  );

  return result[0] || null;
}

export async function markPoolVoucherSold(poolId, userId, voucherId, env) {
  return supabaseRequest(
    'rpc/mark_pool_voucher_sold',
    {
      method: 'POST',
      body: JSON.stringify({
        p_pool_id: poolId,
        p_user_id: userId,
        p_voucher_id: voucherId
      })
    },
    env
  );
}

export async function releasePoolVoucher(poolId, reason, env) {
  return supabaseRequest(
    'rpc/release_pool_voucher',
    {
      method: 'POST',
      body: JSON.stringify({
        p_pool_id: poolId,
        p_reason: reason || null
      })
    },
    env
  );
}

export async function importVoucherPoolRows(rows, env) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  return supabaseRequest(
    'voucher_pool?on_conflict=username',
    {
      method: 'POST',
      headers: {
        Prefer: 'resolution=ignore-duplicates,return=representation'
      },
      body: JSON.stringify(rows)
    },
    env
  );
}

// VOUCHERS
export async function createVoucher(voucherData, env) {
  return supabaseRequest(
    'vouchers',
    {
      method: 'POST',
      body: JSON.stringify(voucherData)
    },
    env
  );
}

export async function updateVoucherStatusByUsername(username, status, env) {
  return supabaseRequest(
    `vouchers?username=eq.${encodeURIComponent(username)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
        revoked_at: status === 'revoked' ? new Date().toISOString() : null
      })
    },
    env
  );
}

export async function getUserVouchers(userId, env) {
  return supabaseRequest(
    `vouchers?user_id=eq.${userId}&select=*,packages(name,duration)&order=created_at.desc`,
    { method: 'GET' },
    env
  );
}

// TOPUPS
export async function createTopup(topupData, env) {
  return supabaseRequest(
    'topups',
    {
      method: 'POST',
      body: JSON.stringify(topupData)
    },
    env
  );
}

export async function getPendingTopups(env) {
  return supabaseRequest('topups?status=eq.pending&select=*', { method: 'GET' }, env);
}

export async function updateTopupStatus(topupId, status, confirmedBy, env) {
  return supabaseRequest(
    `topups?id=eq.${topupId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        confirmed_by: confirmedBy,
        confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
    },
    env
  );
}

export async function clearTopupProof(topupId, env) {
  return supabaseRequest(
    `topups?id=eq.${topupId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        proof_image_url: null,
        updated_at: new Date().toISOString()
      })
    },
    env
  );
}

// TRANSACTIONS
export async function createTransaction(transactionData, env) {
  return supabaseRequest(
    'transactions',
    {
      method: 'POST',
      body: JSON.stringify(transactionData)
    },
    env
  );
}

export async function getUserTransactions(userId, env) {
  return supabaseRequest(
    `transactions?user_id=eq.${userId}&select=*&order=created_at.desc`,
    { method: 'GET' },
    env
  );
}

// ADMIN
export async function getAllUsers(env) {
  return supabaseRequest(
    'users?select=id,name,email,role,is_active,created_at&order=created_at.desc',
    { method: 'GET' },
    env
  );
}

export async function getAllTopups(env) {
  return supabaseRequest(
    'topups?select=*&order=created_at.desc',
    { method: 'GET' },
    env
  );
}
