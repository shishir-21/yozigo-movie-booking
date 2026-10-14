import { describe, expect, it } from 'vitest';
import { isValidNewPassword, normalizeProfileName, passwordsMatch } from './account-settings';

describe('account settings validation helpers', () => {
  it('trims profile names before submission', () => {
    expect(normalizeProfileName('  Shishir Mahato  ')).toBe('Shishir Mahato');
  });

  it('requires the password confirmation to match exactly', () => {
    expect(passwordsMatch('strong-pass-1', 'strong-pass-1')).toBe(true);
    expect(passwordsMatch('strong-pass-1', 'strong-pass-2')).toBe(false);
  });

  it('accepts new passwords from 8 through 72 characters', () => {
    expect(isValidNewPassword('12345678')).toBe(true);
    expect(isValidNewPassword('a'.repeat(72))).toBe(true);
    expect(isValidNewPassword('short')).toBe(false);
    expect(isValidNewPassword('a'.repeat(73))).toBe(false);
  });
});
