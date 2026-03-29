/**
 * Utility integrasi MikroTik RouterOS melalui tunnel.web.id.
 *
 * Cloudflare Workers tidak bisa koneksi TCP langsung ke RouterOS API,
 * sehingga integrasi dilakukan via endpoint HTTP tunnel.
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function hmacSha256(value, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return toBase64Url(new Uint8Array(signature));
}

function normalizeTunnelBaseUrl(env) {
  return (env.TUNNEL_BASE_URL || '').trim().replace(/\/$/, '');
}

function shouldUseMock(env) {
  const mode = (env.MIKROTIK_MODE || '').trim().toLowerCase();
  const baseUrl = normalizeTunnelBaseUrl(env);
  const key = (env.TUNNEL_SHARED_KEY || '').trim();

  if (mode === 'mock') return true;
  if (!baseUrl || !key) return true;
  return false;
}

async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Tunnel timeout (${timeoutMs}ms)`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callTunnel(endpoint, payload, env) {
  const baseUrl = normalizeTunnelBaseUrl(env);
  const sharedKey = (env.TUNNEL_SHARED_KEY || '').trim();
  const apiKey = (env.TUNNEL_API_KEY || sharedKey).trim();
  const timeoutMs = Number(env.TUNNEL_TIMEOUT_MS || 10000);
  const maxRetries = Number(env.TUNNEL_MAX_RETRIES || 2);

  const url = `${baseUrl}${endpoint}`;
  const body = JSON.stringify(payload || {});

  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await hmacSha256(`${body}${timestamp}`, sharedKey);

    try {
      const requestPromise = fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature
        },
        body
      });

      const response = await withTimeout(requestPromise, timeoutMs);

      if (!response.ok) {
        const responseBody = await response.text();
        const error = new Error(`Tunnel HTTP ${response.status}: ${responseBody}`);
        error.status = response.status;
        throw error;
      }

      const result = await response.json().catch(() => ({}));
      if (result.success === false) {
        throw new Error(result.error || 'Tunnel mengembalikan success=false');
      }

      return result;
    } catch (error) {
      lastError = error;
      const status = error.status || 0;
      const retryable = status === 0 || RETRYABLE_STATUS.has(status) || error.message.includes('timeout');

      if (!retryable || attempt === maxRetries) {
        break;
      }

      await sleep(300 * (attempt + 1));
    }
  }

  throw lastError || new Error('Gagal memanggil tunnel');
}

/**
 * Generate username/password voucher random.
 */
export function generateVoucherCredentials() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let username = 'V';
  for (let i = 0; i < 6; i += 1) {
    username += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  let password = '';
  for (let i = 0; i < 8; i += 1) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return { username, password };
}

/**
 * Create voucher di MikroTik via tunnel.
 */
export async function createMikrotikVoucher(username, password, pkgOrPackageId, env) {
  try {
    if (shouldUseMock(env)) {
      return {
        success: true,
        username,
        password,
        message: 'Voucher created (MOCK MODE)',
        router_user_id: null
      };
    }

    const packagePayload = typeof pkgOrPackageId === 'object' && pkgOrPackageId !== null ? pkgOrPackageId : null;

    const payload = {
      username,
      password,
      profile_name: packagePayload?.profile_name || String(pkgOrPackageId || ''),
      limit_uptime: packagePayload?.limit_uptime || null,
      comment: packagePayload?.comment || null,
      server: env.MIKROTIK_SERVER || 'hotspot1'
    };

    const result = await callTunnel('/routeros/voucher/create', payload, env);

    return {
      success: true,
      username,
      password,
      router_user_id: result?.data?.router_user_id || null,
      message: 'Voucher created via tunnel'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      username,
      password
    };
  }
}

/**
 * Revoke voucher di MikroTik via tunnel.
 */
export async function revokeMikrotikVoucher(username, env) {
  try {
    if (shouldUseMock(env)) {
      return {
        success: true,
        message: `Voucher ${username} revoked (MOCK MODE)`
      };
    }

    await callTunnel(
      '/routeros/voucher/revoke',
      {
        username,
        remove_active: true
      },
      env
    );

    return {
      success: true,
      message: `Voucher ${username} revoked`
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Health check tunnel dan router.
 */
export async function validateMikrotikVoucher(username, password, env) {
  try {
    if (shouldUseMock(env)) {
      return {
        valid: true,
        message: 'Voucher valid (MOCK MODE)'
      };
    }

    await callTunnel(
      '/routeros/voucher/validate',
      {
        username,
        password
      },
      env
    );

    return {
      valid: true,
      message: 'Voucher valid'
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}
