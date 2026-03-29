import { describe, expect, it } from 'vitest';
import { generateVoucherCredentials } from '../src/utils/mikrotik.js';

describe('voucher credentials', () => {
  it('generates non-empty username and password', () => {
    const cred = generateVoucherCredentials();
    expect(cred.username.length).toBeGreaterThan(3);
    expect(cred.password.length).toBeGreaterThan(5);
  });
});
