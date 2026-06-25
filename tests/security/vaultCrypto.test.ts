import { beforeEach, describe, expect, it } from 'vitest';
import { lockVault, resetVaultStorage, sealBytes, sealText, setupVault, unsealBytes, unsealText, unlockVault, isVaultUnlocked, requireSession } from '../../src/security/vault';

describe('vault crypto', () => {
  beforeEach(async () => {
    await resetVaultStorage();
  });

  it('sets up, locks, and unlocks a vault with the same passphrase', async () => {
    await setupVault('swordfish');
    expect(isVaultUnlocked()).toBe(true);
    lockVault();
    expect(isVaultUnlocked()).toBe(false);
    await unlockVault('swordfish');
    expect(isVaultUnlocked()).toBe(true);
  });

  it('encrypts and decrypts text and bytes round-trip', async () => {
    await setupVault('swordfish');
    const text = await sealText(requireSession().key, 'vault message');
    const bytes = await sealBytes(new TextEncoder().encode('raw-bytes'));
    lockVault();
    await unlockVault('swordfish');
    expect(await unsealText(requireSession().key, text)).toBe('vault message');
    expect(new TextDecoder().decode((await unsealBytes(bytes)).bytes)).toBe('raw-bytes');
  });

  it('rejects the wrong passphrase', async () => {
    await setupVault('swordfish');
    lockVault();
    await expect(unlockVault('wrong')).rejects.toThrow(/Wrong passphrase/i);
  });

  it('fails on malformed encrypted payloads', async () => {
    await setupVault('swordfish');
    await expect(unsealText(requireSession().key, 'BDP1:not-json')).rejects.toThrow(/corrupted/i);
  });
});
