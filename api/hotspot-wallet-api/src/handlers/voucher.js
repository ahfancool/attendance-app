/**
 * Handler voucher.
 */

import { generateJWT, verifyJWT, getBearerToken } from '../utils/jwt.js';
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
  releasePoolVoucher,
  getVoucherByIdForUser,
  markVoucherUsed
} from '../utils/supabase.js';

function resolveBundleSize(pkg) {
  const normalized = `${pkg?.name || ''} ${pkg?.duration || ''}`.toLowerCase();

  const durationMatch = normalized.match(/(\d+)\s*x\s*24/);
  if (durationMatch) {
    return Math.max(1, Number(durationMatch[1]) || 1);
  }

  if (normalized.includes('25 hari')) return 25;
  if (normalized.includes('5 hari')) return 5;
  if (normalized.includes('1 hari')) return 1;

  if (Number(pkg?.price) === 25000) return 25;
  if (Number(pkg?.price) === 5000) return 5;
  if (Number(pkg?.price) === 1000) return 1;

  return 1;
}

async function claimBundleFromPool(packageId, bundleSize, env) {
  const claimed = [];

  for (let i = 0; i < bundleSize; i += 1) {
    const pooled = await claimVoucherFromPool(packageId, env);
    if (!pooled) break;
    claimed.push(pooled);
  }

  if (claimed.length === bundleSize) {
    return claimed;
  }

  await Promise.all(
    claimed.map((item) =>
      releasePoolVoucher(item.id, 'rollback: stok tidak cukup untuk bundle purchase', env).catch(() => null)
    )
  );

  return null;
}

function findDailyPackage(packages) {
  return packages.find((item) => {
    const text = `${item?.name || ''} ${item?.duration || ''}`.toLowerCase();
    return Number(item?.price) === 1000 || text.includes('1 hari');
  });
}

async function resolveClaimPackageId(purchasedPackage, bundleSize, env) {
  if (bundleSize <= 1) {
    return purchasedPackage.id;
  }

  const activePackages = await getActivePackages(env);
  const dailyPackage = findDailyPackage(activePackages || []);
  return dailyPackage?.id || purchasedPackage.id;
}

function getAuthPayload(request, secret) {
  const token = getBearerToken(request);
  return verifyJWT(token, secret);
}

async function createActivationToken(userId, voucherId, secret) {
  return generateJWT(
    {
      sub: userId,
      voucher_id: voucherId,
      action: 'voucher_use_confirm',
      nonce: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 10 * 60
    },
    secret
  );
}

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
    const payload = await getAuthPayload(request, env.JWT_SECRET);
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

    const bundleSize = resolveBundleSize(pkg);
    const claimPackageId = await resolveClaimPackageId(pkg, bundleSize, env);
    const claimedPoolRows = await claimBundleFromPool(claimPackageId, bundleSize, env);

    if (!claimedPoolRows) {
      return jsonResponse(
        {
          error: 'Stok voucher tidak cukup',
          detail:
            bundleSize === 1
              ? 'Stok voucher habis. Admin perlu isi pool dari Mikhmon.'
              : `Paket ini butuh ${bundleSize} voucher harian, tetapi stok tidak cukup.`
        },
        409
      );
    }

    const bundleId = `bundle-${crypto.randomUUID()}`;
    const createdVouchers = [];
    const soldPoolIds = new Set();
    const oldBalance = wallet.balance;
    const newBalance = oldBalance - pkg.price;

    try {
      await updateWalletBalance(payload.sub, newBalance, env);

      for (let i = 0; i < claimedPoolRows.length; i += 1) {
        const pooled = claimedPoolRows[i];
        const voucher = await createVoucher(
          {
            user_id: payload.sub,
            package_id,
            username: pooled.username,
            password: pooled.password,
            price: pkg.price,
            status: 'assigned',
            router_user_id: bundleId
          },
          env
        );

        const created = voucher[0];
        createdVouchers.push({
          ...created,
          bundle_id: bundleId,
          bundle_size: bundleSize,
          bundle_index: i + 1
        });

        await markPoolVoucherSold(pooled.id, payload.sub, created.id, env);
        soldPoolIds.add(pooled.id);
      }

      await createTransaction(
        {
          user_id: payload.sub,
          type: 'purchase',
          amount: -pkg.price,
          reference_type: 'voucher',
          reference_id: createdVouchers[0].id,
          status: 'success',
          note: `bundle:${bundleId};qty:${bundleSize}`
        },
        env
      );

      return jsonResponse(
        {
          message: 'Paket berhasil dibeli. Pilih tombol hari pada Voucher Saya.',
          purchase: {
            bundle_id: bundleId,
            bundle_size: bundleSize
          },
          vouchers: createdVouchers.map((item) => ({
            id: item.id,
            username: item.username,
            password: item.password,
            package_name: pkg.name,
            duration: pkg.duration,
            price: pkg.price,
            status: item.status,
            created_at: item.created_at,
            bundle_id: bundleId,
            bundle_size: bundleSize,
            bundle_index: item.bundle_index
          })),
          remaining_balance: newBalance
        },
        201
      );
    } catch (innerError) {
      const unsoldPoolRows = claimedPoolRows.filter((row) => !soldPoolIds.has(row.id));
      await Promise.all(
        unsoldPoolRows.map((item) =>
          releasePoolVoucher(item.id, `buy-voucher rollback: ${innerError.message || 'unknown'}`, env).catch(
            () => null
          )
        )
      );

      if (!createdVouchers.length) {
        await updateWalletBalance(payload.sub, oldBalance, env).catch(() => null);
      }

      throw innerError;
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleUseVoucher(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const { voucher_id } = body;

    if (!voucher_id) {
      return jsonResponse({ error: 'Voucher ID wajib diisi' }, 400);
    }

    const voucher = await getVoucherByIdForUser(voucher_id, payload.sub, env);
    if (!voucher) {
      return jsonResponse({ error: 'Voucher tidak ditemukan' }, 404);
    }

    if (voucher.status !== 'assigned') {
      return jsonResponse({ error: 'Voucher ini sudah tidak bisa digunakan lagi' }, 400);
    }

    const activationToken = await createActivationToken(payload.sub, voucher.id, env.JWT_SECRET);

    return jsonResponse({
      message: 'Voucher tervalidasi. Lanjut login hotspot.',
      activation_token: activationToken,
      voucher: {
        id: voucher.id,
        username: voucher.username,
        password: voucher.password,
        package_name: voucher.packages?.name || null,
        duration: voucher.packages?.duration || null
      }
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleConfirmVoucherUse(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
    if (!payload) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const { activation_token, voucher_id } = body;

    if (!activation_token) {
      return jsonResponse({ error: 'Token aktivasi wajib diisi' }, 400);
    }

    const activationPayload = await verifyJWT(activation_token, env.JWT_SECRET);
    if (!activationPayload) {
      return jsonResponse({ error: 'Token aktivasi tidak valid atau kedaluwarsa' }, 401);
    }

    if (activationPayload.action !== 'voucher_use_confirm') {
      return jsonResponse({ error: 'Aksi token tidak valid' }, 401);
    }

    if (activationPayload.sub !== payload.sub) {
      return jsonResponse({ error: 'Token aktivasi bukan milik user ini' }, 403);
    }

    const targetVoucherId = voucher_id || activationPayload.voucher_id;
    if (!targetVoucherId || targetVoucherId !== activationPayload.voucher_id) {
      return jsonResponse({ error: 'Voucher ID tidak cocok dengan token' }, 400);
    }

    const voucher = await getVoucherByIdForUser(targetVoucherId, payload.sub, env);
    if (!voucher) {
      return jsonResponse({ error: 'Voucher tidak ditemukan' }, 404);
    }

    if (voucher.status === 'used') {
      return jsonResponse({
        message: 'Voucher sudah aktif sebelumnya',
        already_confirmed: true,
        voucher_id: voucher.id
      });
    }

    if (voucher.status !== 'assigned') {
      return jsonResponse({ error: 'Status voucher tidak bisa dikonfirmasi' }, 400);
    }

    const updatedRows = await markVoucherUsed(targetVoucherId, env);
    if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
      return jsonResponse({ error: 'Voucher gagal ditandai sebagai terpakai' }, 409);
    }

    return jsonResponse({
      message: 'Voucher berhasil diaktifkan',
      voucher_id: targetVoucherId
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleMyVouchers(request, env) {
  try {
    const payload = await getAuthPayload(request, env.JWT_SECRET);
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
