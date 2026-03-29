/**
 * Handler autentikasi.
 */

import { generateJWT, verifyJWT, getBearerToken } from '../utils/jwt.js';
import { getUserByEmail, createUser, getUserById, getWalletByUserId } from '../utils/supabase.js';

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function comparePassword(password, hash) {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
}

export async function handleRegister(request, env) {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!name || !email || !password) {
      return jsonResponse({ error: 'Nama, email, dan password wajib diisi' }, 400);
    }

    if (password.length < 6) {
      return jsonResponse({ error: 'Password minimal 6 karakter' }, 400);
    }

    const existingUser = await getUserByEmail(email, env);
    if (existingUser) {
      return jsonResponse({ error: 'Email sudah terdaftar' }, 409);
    }

    const passwordHash = await hashPassword(password);

    const newUser = await createUser(
      {
        name,
        email,
        password_hash: passwordHash,
        role: 'student'
      },
      env
    );

    return jsonResponse(
      {
        message: 'Registrasi berhasil',
        user: {
          id: newUser[0].id,
          name: newUser[0].name,
          email: newUser[0].email,
          role: newUser[0].role
        }
      },
      201
    );
  } catch (error) {
    return jsonResponse({ error: `Gagal registrasi: ${error.message}` }, 500);
  }
}

export async function handleLogin(request, env) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return jsonResponse({ error: 'Email dan password wajib diisi' }, 400);
    }

    const user = await getUserByEmail(email, env);
    if (!user) {
      return jsonResponse({ error: 'Email atau password salah' }, 401);
    }

    const validPassword = await comparePassword(password, user.password_hash);
    if (!validPassword) {
      return jsonResponse({ error: 'Email atau password salah' }, 401);
    }

    const token = await generateJWT(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
      },
      env.JWT_SECRET
    );

    return jsonResponse({
      message: 'Login berhasil',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    return jsonResponse({ error: `Gagal login: ${error.message}` }, 500);
  }
}

export async function handleMe(request, env) {
  try {
    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ error: 'Token tidak ditemukan' }, 401);
    }

    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Token tidak valid' }, 401);
    }

    const user = await getUserById(payload.sub, env);
    if (!user) {
      return jsonResponse({ error: 'User tidak ditemukan' }, 404);
    }

    const wallet = await getWalletByUserId(user.id, env);

    return jsonResponse({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      wallet: wallet
        ? {
            balance: wallet.balance,
            updated_at: wallet.updated_at
          }
        : null
    });
  } catch (error) {
    return jsonResponse({ error: `Gagal mengambil profil: ${error.message}` }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
