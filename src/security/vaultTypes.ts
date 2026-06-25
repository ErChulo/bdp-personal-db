export type VaultPhase = 'checking' | 'setup' | 'locked' | 'unlocked' | 'error';

export interface VaultMeta {
  version: 1;
  saltB64: string;
  iterations: number;
  sealedCheck: string;
  createdAt: number;
  updatedAt: number;
}

export interface VaultState {
  phase: VaultPhase;
  hasVault: boolean;
  message: string | null;
}

export interface VaultSession {
  unlockedAt: number;
  key: CryptoKey;
}

export interface EncryptedEnvelope {
  v: 1;
  kind: 'text' | 'bytes';
  ivB64: string;
  dataB64: string;
}

