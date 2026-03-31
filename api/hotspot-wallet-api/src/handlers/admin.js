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
  getPackageById,
  updateVoucherStatusByUsername,
  deleteProofImageByUrl,
  clearTopupProof,
  importVoucherPoolRows,
  getVoucherPoolRowsForSync,
  purgeTopupsNonPendingOlderThan,
  purgeTransactionsFinalOlderThan,
  purgeVouchersUsedOrRevokedOlderThan,
  purgeVoucherPoolSoldOlderThan
} from '../utils/supabase.js';
import { createMikrotikVoucher } from '../utils/mikrotik.js';

const MAX_IMPORT_ROWS = 3000;
const DEFAULT_SYNC_LIMIT = 5000;
const MAX_PURGE_DAYS = 3650;
const DEFAULT_PURGE_POLICY = Object.freeze({
  topups_days: 30,
  transactions_days: 30,
  vouchers_days: 10,
  voucher_pool_sold_days: 10
});

function normalizeCsvCell(value) {
  return String(value || '')
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .trim();
}

function splitCsvLine(line, delimiter) {
  const columns = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      columns.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns.map((item) => normalizeCsvCell(item));
}

function detectDelimiter(line) {
  const checks = [
    { delimiter: ',', count: (line.match(/,/g) || []).length },
    { delimiter: ';', count: (line.match(/;/g) || []).length },
    { delimiter: '\t', count: (line.match(/\t/g) || []).length }
  ].sort((a, b) => b.count - a.count);

  return checks[0].count > 0 ? checks[0].delimiter : ',';
}

function parseVoucherCsv(csvText) {
  const lines = String(csvText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error('CSV kosong. Isi file voucher terlebih dahulu.');
  }

  const delimiter = detectDelimiter(lines[0]);
  const firstColumns = splitCsvLine(lines[0], delimiter).map((item) => item.toLowerCase());

  const usernameKeys = new Set(['username', 'user', 'voucher', 'kode', 'code']);
  const passwordKeys = new Set(['password', 'pass', 'pwd']);

  const headerUserIndex = firstColumns.findIndex((name) => usernameKeys.has(name));
  const headerPassIndex = firstColumns.findIndex((name) => passwordKeys.has(name));
  const hasHeader = headerUserIndex !== -1 && headerPassIndex !== -1;

  const usernameIndex = hasHeader ? headerUserIndex : 0;
  const passwordIndex = hasHeader ? headerPassIndex : 1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (!dataLines.length) {
    throw new Error('CSV tidak memiliki data voucher.');
  }

  const seenUsernames = new Set();
  const rows = [];
  let skippedInvalid = 0;
  let skippedDuplicateInFile = 0;

  dataLines.forEach((line) => {
    const columns = splitCsvLine(line, delimiter);
    const username = normalizeCsvCell(columns[usernameIndex]);
    const password = normalizeCsvCell(columns[passwordIndex]);

    if (!username || !password) {
      skippedInvalid += 1;
      return;
    }

    if (seenUsernames.has(username)) {
      skippedDuplicateInFile += 1;
      return;
    }

    seenUsernames.add(username);
    rows.push({ username, password });
  });

  if (!rows.length) {
    throw new Error('Tidak ada baris voucher valid di CSV.');
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Jumlah voucher melebihi batas ${MAX_IMPORT_ROWS} baris per impor.`);
  }

  return {
    rows,
    skipped_invalid: skippedInvalid,
    skipped_duplicate_in_file: skippedDuplicateInFile,
    has_header: hasHeader,
    delimiter: delimiter === '\t' ? 'tab' : delimiter
  };
}

function buildSyncRouterScript(rows, profileName) {
  const lines = [];
  lines.push('# Auto-generated from voucher_pool (non-seed_sql)');
  lines.push(':local added 0');
  lines.push(':local updated 0');

  rows.forEach((row) => {
    const username = String(row.username || '').replace(/"/g, '').trim();
    const password = String(row.password || '').replace(/"/g, '').trim();
    const source = String(row.source || '').replace(/"/g, '').trim();
    const status = String(row.status || '').replace(/"/g, '').trim();

    if (!username || !password) return;

    const comment = `wallet-sync ${source} ${status}`.replace(/"/g, '');
    const profile = String(profileName || 'harian').replace(/"/g, '');

    lines.push(`:local uid [/ip hotspot user find where name="${username}"]`);
    lines.push(':if ([:len $uid] = 0) do={');
    lines.push(
      `  /ip hotspot user add name="${username}" password="${password}" profile="${profile}" comment="${comment}"`
    );
    lines.push('  :set added ($added + 1)');
    lines.push('} else={');
    lines.push(
      `  /ip hotspot user set $uid password="${password}" profile="${profile}" comment="${comment}"`
    );
    lines.push('  :set updated ($updated + 1)');
    lines.push('}');
  });

  lines.push(':put ("sync done | added=" . $added . " updated=" . $updated)');
  return `${lines.join('\n')}\n`;
}

function shouldRunLiveRouterSync(env) {
  const mode = String(env.MIKROTIK_MODE || '').trim().toLowerCase();
  const base = String(env.TUNNEL_BASE_URL || '').trim();
  const shared = String(env.TUNNEL_SHARED_KEY || '').trim();
  return mode === 'live' && Boolean(base) && Boolean(shared);
}

function normalizePurgeDays(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), MAX_PURGE_DAYS);
}

function toCutoffIso(days) {
  const daysMs = Math.floor(days) * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - daysMs).toISOString();
}

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
      let cleanupWarning = null;

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

      if (topup.proof_image_url) {
        try {
          await deleteProofImageByUrl(topup.proof_image_url, env);
          await clearTopupProof(topup_id, env);
        } catch (cleanupError) {
          cleanupWarning = `Topup sukses, namun bukti belum terhapus otomatis: ${cleanupError.message}`;
        }
      }

      return jsonResponse({
        message: 'Topup berhasil dikonfirmasi',
        new_balance: newBalance,
        ...(cleanupWarning ? { warning: cleanupWarning } : {})
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

export async function handleAdminImportVoucherPool(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const body = await request.json();
    const { package_id, csv_text, batch_code } = body;

    if (!package_id) {
      return jsonResponse({ error: 'Package ID wajib diisi' }, 400);
    }

    if (!csv_text || !String(csv_text).trim()) {
      return jsonResponse({ error: 'File CSV wajib diisi' }, 400);
    }

    const pkg = await getPackageById(package_id, env);
    if (!pkg) {
      return jsonResponse({ error: 'Paket tidak ditemukan' }, 404);
    }

    const parsed = parseVoucherCsv(csv_text);
    const normalizedBatch = String(batch_code || '').trim() || null;
    const nowIso = new Date().toISOString();

    const payloadRows = parsed.rows.map((item) => ({
      package_id,
      username: item.username,
      password: item.password,
      status: 'available',
      source: 'csv_import',
      batch_code: normalizedBatch,
      generated_at: nowIso,
      note: `imported_by_admin:${adminCheck.payload.sub}`
    }));

    const inserted = await importVoucherPoolRows(payloadRows, env);
    const insertedCount = Array.isArray(inserted) ? inserted.length : 0;
    const skippedDbDuplicate = payloadRows.length - insertedCount;
    const skippedTotal =
      parsed.skipped_invalid + parsed.skipped_duplicate_in_file + skippedDbDuplicate;

    return jsonResponse({
      message: `Import selesai. ${insertedCount} voucher berhasil ditambahkan.`,
      package: {
        id: pkg.id,
        name: pkg.name
      },
      requested_rows: payloadRows.length,
      inserted_rows: insertedCount,
      skipped_rows: skippedTotal,
      skipped_invalid_rows: parsed.skipped_invalid,
      skipped_duplicate_in_file: parsed.skipped_duplicate_in_file,
      skipped_duplicate_in_database: skippedDbDuplicate,
      detected_delimiter: parsed.delimiter,
      detected_header: parsed.has_header
    });
  } catch (error) {
    const message = String(error?.message || 'Terjadi kesalahan saat impor CSV');
    const isValidationError =
      message.includes('CSV') ||
      message.includes('baris') ||
      message.includes('Package ID') ||
      message.includes('Paket');

    return jsonResponse({ error: message }, isValidationError ? 400 : 500);
  }
}

export async function handleAdminSyncVoucherPoolToRouter(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const profileName = String(body.profile_name || 'harian').trim() || 'harian';
    const limit = Number(body.limit || DEFAULT_SYNC_LIMIT);

    const rows = await getVoucherPoolRowsForSync(env, {
      exclude_source: 'seed_sql',
      statuses: ['available', 'reserved', 'sold'],
      limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_SYNC_LIMIT
    });

    const normalizedRows = Array.isArray(rows) ? rows : [];
    const scriptContent = buildSyncRouterScript(normalizedRows, profileName);
    const scriptFilename = `sync_pool_to_mikrotik_${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}.rsc`;

    if (!normalizedRows.length) {
      return jsonResponse({
        mode: 'script_only',
        message: 'voucher_pool produksi kosong. Import CSV voucher dulu dari panel admin.',
        rows_total: 0,
        profile_name: profileName,
        script_filename: scriptFilename,
        script_content: scriptContent
      });
    }

    if (!shouldRunLiveRouterSync(env)) {
      return jsonResponse({
        mode: 'script_only',
        message:
          'Tunnel sync live belum aktif (MIKROTIK_MODE/TUNNEL_BASE_URL/TUNNEL_SHARED_KEY). Download script .rsc lalu import via Winbox/File + System Script.',
        rows_total: normalizedRows.length,
        profile_name: profileName,
        script_filename: scriptFilename,
        script_content: scriptContent
      });
    }

    let synced = 0;
    let alreadyExists = 0;
    const failed = [];

    for (const row of normalizedRows) {
      const username = String(row.username || '').trim();
      const password = String(row.password || '').trim();
      const source = String(row.source || '').trim();
      const status = String(row.status || '').trim();

      if (!username || !password) continue;

      const result = await createMikrotikVoucher(
        username,
        password,
        {
          profile_name: profileName,
          comment: `wallet-sync ${source} ${status}`,
          limit_uptime: null
        },
        env
      );

      if (result?.success) {
        const msg = String(result.message || '').toLowerCase();
        if (msg.includes('mock mode')) {
          return jsonResponse({
            mode: 'script_only',
            message:
              'MIKROTIK_MODE masih mock. Live sync belum jalan. Download script .rsc untuk import manual.',
            rows_total: normalizedRows.length,
            profile_name: profileName,
            script_filename: scriptFilename,
            script_content: scriptContent
          });
        }
        synced += 1;
        continue;
      }

      const err = String(result?.error || '').toLowerCase();
      if (err.includes('already') || err.includes('exists')) {
        alreadyExists += 1;
        continue;
      }

      failed.push({
        username,
        error: result?.error || 'Unknown error'
      });
    }

    return jsonResponse({
      mode: 'tunnel_sync',
      message: `Sync selesai. synced=${synced}, existing=${alreadyExists}, failed=${failed.length}`,
      rows_total: normalizedRows.length,
      synced_rows: synced,
      existing_rows: alreadyExists,
      failed_rows: failed.length,
      failed_details: failed.slice(0, 20),
      profile_name: profileName,
      script_filename: scriptFilename,
      script_content: scriptContent
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

export async function handleAdminMaintenancePurge(request, env) {
  const adminCheck = await requireAdmin(request, env);
  if (adminCheck.error) {
    return jsonResponse({ error: adminCheck.error }, adminCheck.status);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const policy = {
      topups_days: normalizePurgeDays(body.topups_days, DEFAULT_PURGE_POLICY.topups_days),
      transactions_days: normalizePurgeDays(
        body.transactions_days,
        DEFAULT_PURGE_POLICY.transactions_days
      ),
      vouchers_days: normalizePurgeDays(body.vouchers_days, DEFAULT_PURGE_POLICY.vouchers_days),
      voucher_pool_sold_days: normalizePurgeDays(
        body.voucher_pool_sold_days,
        DEFAULT_PURGE_POLICY.voucher_pool_sold_days
      )
    };

    const cutoffTopups = toCutoffIso(policy.topups_days);
    const cutoffTransactions = toCutoffIso(policy.transactions_days);
    const cutoffVouchers = toCutoffIso(policy.vouchers_days);
    const cutoffPoolSold = toCutoffIso(policy.voucher_pool_sold_days);

    const [topupsDeleted, transactionsDeleted, vouchersDeleted, poolDeleted] = await Promise.all([
      purgeTopupsNonPendingOlderThan(cutoffTopups, env),
      purgeTransactionsFinalOlderThan(cutoffTransactions, env),
      purgeVouchersUsedOrRevokedOlderThan(cutoffVouchers, env),
      purgeVoucherPoolSoldOlderThan(cutoffPoolSold, env)
    ]);

    const deleted = {
      topups: Array.isArray(topupsDeleted) ? topupsDeleted.length : 0,
      transactions: Array.isArray(transactionsDeleted) ? transactionsDeleted.length : 0,
      vouchers: Array.isArray(vouchersDeleted) ? vouchersDeleted.length : 0,
      voucher_pool_sold: Array.isArray(poolDeleted) ? poolDeleted.length : 0
    };

    return jsonResponse({
      message: `Purge selesai. topups=${deleted.topups}, transactions=${deleted.transactions}, vouchers=${deleted.vouchers}, pool_sold=${deleted.voucher_pool_sold}`,
      policy,
      cutoff: {
        topups_lt: cutoffTopups,
        transactions_lt: cutoffTransactions,
        vouchers_lt: cutoffVouchers,
        voucher_pool_sold_lt: cutoffPoolSold
      },
      deleted
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
