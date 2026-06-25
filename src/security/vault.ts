import { vaultStore } from './vaultStore';
import type { EncryptedEnvelope, VaultMeta, VaultSession } from './vaultTypes';

const MAGIC = 'BDP1:';
const DEFAULT_ITERATIONS = 210_000;
const CHECK_TOKEN = 'bdp-vault-check';

let session: VaultSession | null = null;

export function isVaultUnlocked(): boolean {
  return Boolean(session);
}

export async function inspectVault(): Promise<'setup' | 'locked'> {
  return (await vaultStore.exists()) ? 'locked' : 'setup';
}

export async function setupVault(passphrase: string): Promise<void> {
  if (!passphrase.trim()) throw new Error('Passphrase is required');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt, DEFAULT_ITERATIONS);
  const meta: VaultMeta = {
    version: 1,
    saltB64: toB64(salt),
    iterations: DEFAULT_ITERATIONS,
    sealedCheck: await sealText(key, CHECK_TOKEN),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await vaultStore.write(meta);
  session = { key, unlockedAt: Date.now() };
}

export async function unlockVault(passphrase: string): Promise<void> {
  const meta = await requireMeta();
  const key = await deriveKey(passphrase, fromB64(meta.saltB64), meta.iterations);
  try {
    const check = await unsealText(key, meta.sealedCheck);
    if (check !== CHECK_TOKEN) throw new Error('Wrong passphrase');
  } catch {
    throw new Error('Wrong passphrase');
  }
  session = { key, unlockedAt: Date.now() };
}

export function lockVault(): void {
  session = null;
}

export async function resetVaultStorage(): Promise<void> {
  lockVault();
  await vaultStore.clear();
}

export function requireSession(): VaultSession {
  if (!session) throw new Error('Vault is locked');
  return session;
}

export async function sealText(cryptoKey: CryptoKey, plainText: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toBufferSource(iv) },
    cryptoKey,
    toBufferSource(new TextEncoder().encode(plainText)),
  );
  return `${MAGIC}${btoaJson({
    v: 1,
    kind: 'text',
    ivB64: toB64(iv),
    dataB64: toB64(new Uint8Array(payload)),
  })}`;
}

export async function unsealText(cryptoKey: CryptoKey, value: string): Promise<string> {
  const envelope = parseEnvelope(value);
  if (!envelope) return value;
  if (envelope.kind !== 'text') throw new Error('Vault data is corrupted');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(fromB64(envelope.ivB64)) },
    cryptoKey,
    toBufferSource(fromB64(envelope.dataB64)),
  );
  return new TextDecoder().decode(plaintext);
}

export async function sealBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const key = requireSession().key;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const payload = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, key, toBufferSource(bytes));
  return new TextEncoder().encode(`${MAGIC}${btoaJson({
    v: 1,
    kind: 'bytes',
    ivB64: toB64(iv),
    dataB64: toB64(new Uint8Array(payload)),
  })}`);
}

export async function unsealBytes(bytes: Uint8Array): Promise<{ bytes: Uint8Array; encrypted: boolean }> {
  const raw = new TextDecoder().decode(bytes);
  const envelope = parseEnvelope(raw);
  if (!envelope) return { bytes, encrypted: false };
  if (envelope.kind !== 'bytes') throw new Error('Vault data is corrupted');
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toBufferSource(fromB64(envelope.ivB64)) },
    requireSession().key,
    toBufferSource(fromB64(envelope.dataB64)),
  );
  return { bytes: new Uint8Array(plaintext), encrypted: true };
}

export function isSealedBytes(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes).startsWith(MAGIC);
}

export function isSealedText(value: string): boolean {
  return value.startsWith(MAGIC);
}

export async function sealPlainObject(value: unknown): Promise<string> {
  return sealText(requireSession().key, JSON.stringify(value));
}

export async function unsealPlainObject<T>(value: unknown): Promise<{ value: T; encrypted: boolean }> {
  if (value === null || value === undefined) {
    return { value: value as T, encrypted: false };
  }
  if (typeof value !== 'string') return { value: value as T, encrypted: false };
  const plain = await unsealText(requireSession().key, value);
  try {
    return { value: JSON.parse(plain) as T, encrypted: true };
  } catch {
    return { value: plain as T, encrypted: true };
  }
}

async function requireMeta(): Promise<VaultMeta> {
  const meta = await vaultStore.read();
  if (!meta) throw new Error('Vault is not configured');
  return meta;
}

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    'raw',
    toBufferSource(new TextEncoder().encode(passphrase)),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function parseEnvelope(value: string): EncryptedEnvelope | null {
  if (!value.startsWith(MAGIC)) return null;
  const raw = value.slice(MAGIC.length);
  try {
    const parsed = JSON.parse(atob(raw)) as EncryptedEnvelope;
    if (parsed?.v !== 1) throw new Error('Unsupported vault envelope');
    return parsed;
  } catch {
    throw new Error('Vault data is corrupted');
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

function toBufferSource(bytes: Uint8Array): BufferSource {
  return (typeof Buffer !== 'undefined' ? Buffer.from(bytes) : Uint8Array.from(bytes)) as BufferSource;
}

function fromB64(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function btoaJson(value: unknown): string {
  return btoa(JSON.stringify(value));
}
