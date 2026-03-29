/**
 * Util JWT HS256 untuk Cloudflare Workers.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64UrlFromString(value) {
  const utf8 = encoder.encode(value);
  let binary = '';
  utf8.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64UrlToString(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const normalized = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return decoder.decode(bytes);
}

async function signHmacSHA256(input, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  const signatureBytes = new Uint8Array(signatureBuffer);

  let binary = '';
  signatureBytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export async function generateJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };

  const headerEncoded = toBase64UrlFromString(JSON.stringify(header));
  const payloadEncoded = toBase64UrlFromString(JSON.stringify(payload));

  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const signature = await signHmacSHA256(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const signingInput = `${headerEncoded}.${payloadEncoded}`;
  const expectedSignature = await signHmacSHA256(signingInput, secret);

  if (expectedSignature !== signatureEncoded) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64UrlToString(payloadEncoded));
  } catch {
    return null;
  }

  if (payload.exp && Math.floor(Date.now() / 1000) >= payload.exp) {
    return null;
  }

  return payload;
}

export function getBearerToken(request) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') return null;

  return token.trim();
}
