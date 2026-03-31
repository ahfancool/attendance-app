/**
 * Utility notifikasi Telegram (best-effort, non-blocking caller).
 */

function formatRupiah(value) {
  const numeric = Number(value || 0);
  return `Rp ${new Intl.NumberFormat('id-ID').format(Number.isFinite(numeric) ? numeric : 0)}`;
}

export function buildPendingTopupMessage({
  userEmail,
  amount,
  method,
  status = 'pending',
  adminPanelUrl
}) {
  const link = adminPanelUrl || 'https://ahfancool.github.io/attendance-app/#/admin';

  return [
    'Topup Request Baru',
    '',
    `User: ${userEmail || '-'}`,
    `Nominal: ${formatRupiah(amount)}`,
    `Metode: ${method || '-'}`,
    '',
    `Status: ${status}`,
    '',
    'Silakan cek panel admin.',
    link
  ].join('\n');
}

export async function sendTelegramNotification(env, message) {
  const token = String(env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();

  if (!token || !chatId) {
    return {
      ok: false,
      skipped: true,
      reason: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'
    };
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(message || '').trim(),
      disable_web_page_preview: true
    })
  });

  const raw = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.description || raw || `Telegram API error ${response.status}`);
  }

  if (payload && payload.ok === false) {
    throw new Error(payload.description || 'Telegram API rejected request');
  }

  return {
    ok: true
  };
}
