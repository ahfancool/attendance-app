import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildPendingTopupMessage, sendTelegramNotification } from '../src/utils/telegram.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('telegram pending topup message', () => {
  it('membentuk pesan notifikasi yang berisi data utama', () => {
    const message = buildPendingTopupMessage({
      userEmail: 'siswa@example.com',
      amount: 10000,
      method: 'manual_transfer',
      status: 'pending',
      adminPanelUrl: 'https://ahfancool.github.io/attendance-app/#/admin'
    });

    expect(message).toContain('Topup Request Baru');
    expect(message).toContain('User: siswa@example.com');
    expect(message).toContain('Nominal: Rp 10.000');
    expect(message).toContain('Metode: manual_transfer');
    expect(message).toContain('Status: pending');
  });

  it('melewati pengiriman jika secret telegram belum diisi', async () => {
    const response = await sendTelegramNotification({}, 'tes');
    expect(response.skipped).toBe(true);
  });

  it('mengirim ke Telegram API jika secret tersedia', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ ok: true })
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await sendTelegramNotification(
      {
        TELEGRAM_BOT_TOKEN: 'bot-token',
        TELEGRAM_CHAT_ID: '12345'
      },
      'Halo admin'
    );

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
  });
});
