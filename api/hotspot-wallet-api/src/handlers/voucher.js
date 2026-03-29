/**
 * Handler voucher.
 */

import { verifyJWT, getBearerToken } from '../utils/jwt.js';
import {
  getWalletByUserId,
  updateWalletBalance,
  getActivePackages,
  getPackageById,
  createVoucher,
  getUserVouchers,
  createTransaction,
  claimVoucherFromPool,
  markPoolVoucherSold,
  releasePoolVoucher
} from '../utils/supabase.js';

export async function handleGetPackages(_request, env) {
  try {
    const packages = await getActivePackages(env);
    return jsonResponse({ packages: packages || [] });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleBuyVoucher(request, env) {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const { package_id } = body;

    if (!package_id) {
      return jsonResponse({ error: 'Package ID wajib diisi' }, 400);
    }

    const wallet = await getWalletByUserId(payload.sub, env);
    if (!wallet || wallet.balance <= 0) {
      return jsonResponse({ error: 'Saldo tidak mencukupi' }, 400);
    }

    const pkg = await getPackageById(package_id, env);
    if (!pkg || !pkg.is_active) {
      return jsonResponse({ error: 'Paket tidak tersedia' }, 404);
    }

    if (wallet.balance < pkg.price) {
      return jsonResponse({ error: 'Saldo tidak mencukupi untuk paket ini' }, 400);
    }

    // Mode pre-generated: ambil dari pool voucher (hasil generate Mikhmon)
    const pooled = await claimVoucherFromPool(package_id, env);
    if (!pooled) {
      return jsonResponse(
        {
          error: 'Stok voucher habis',
          detail: 'Admin perlu generate ulang voucher di Mikhmon lalu isi pool database'
        },
        409
      );
    }

    let createdVoucher = null;
    let saleCommitted = false;
    try {
      const newBalance = wallet.balance - pkg.price;
      await updateWalletBalance(payload.sub, newBalance, env);

      const voucher = await createVoucher(
        {
          user_id: payload.sub,
          package_id,
          username: pooled.username,
          password: pooled.password,
          price: pkg.price,
          status: 'assigned'
        },
        env
      );

      createdVoucher = voucher[0];

      await createTransaction(
        {
          user_id: payload.sub,
          type: 'purchase',
          amount: -pkg.price,
          reference_type: 'voucher',
          reference_id: createdVoucher.id,
          status: 'success'
        },
        env
      );

      await markPoolVoucherSold(pooled.id, payload.sub, createdVoucher.id, env);
      saleCommitted = true;

      return jsonResponse(
        {
          message: 'Voucher berhasil dibeli',
          voucher: {
            id: createdVoucher.id,
            username: pooled.username,
            password: pooled.password,
            package_name: pkg.name,
            duration: pkg.duration,
            price: pkg.price,
            created_at: createdVoucher.created_at
          },
          remaining_balance: newBalance
        },
        201
      );
    } catch (innerError) {
      // Kompensasi aman:
      // - Jika voucher aplikasi belum terbuat, pool bisa dilepas kembali.
      // - Jika voucher aplikasi sudah terbuat tetapi mark sold gagal,
      //   jangan release agar tidak terjadi duplikasi voucher ke user lain.
      if (!createdVoucher && !saleCommitted) {
        await releasePoolVoucher(
          pooled.id,
          `buy-voucher rollback: ${innerError.message || 'unknown error'}`,
          env
        ).catch(() => {
          // jangan menutup error asli jika release gagal
        });
      }
      throw innerError;
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleMyVouchers(request, env) {
  try {
    const token = getBearerToken(request);
    const payload = await verifyJWT(token, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const vouchers = await getUserVouchers(payload.sub, env);

    return jsonResponse({
      vouchers: vouchers || []
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
