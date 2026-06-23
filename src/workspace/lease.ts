import type { WorkspaceOwnershipState } from './types';

const LOCK_NAME = 'bdp-workspace-writer';
const TAB_KEY = 'bdp-tab-id';
const EPOCH_KEY = 'bdp-writer-epoch';
let currentRelease: (() => void) | null = null;

function tabId(): string {
  const existing = sessionStorage.getItem(TAB_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  sessionStorage.setItem(TAB_KEY, next);
  return next;
}

function nextEpoch(): number {
  const current = Number(localStorage.getItem(EPOCH_KEY) || '0');
  const next = current + 1;
  localStorage.setItem(EPOCH_KEY, String(next));
  return next;
}

export interface LeaseHandle {
  readonly tabId: string;
  readonly release: () => void;
  readonly status: 'writable' | 'read-only';
  readonly epoch: number;
}

export function startWorkspaceLease(
  onChange: (state: WorkspaceOwnershipState) => void,
  force = false,
): () => void {
  currentRelease?.();
  currentRelease = null;
  const tab = tabId();
  if (!navigator.locks) {
    onChange(createOwnershipState('read-only', 'workspace locking is unavailable'));
    return () => {};
  }
  let releaseResolve: (() => void) | null = null;
  let stopped = false;
  const hold = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  const opts = (force
    ? { mode: 'exclusive', steal: true }
    : { mode: 'exclusive', ifAvailable: true }) as LockOptions;

  onChange(createOwnershipState('acquiring', 'claiming workspace ownership'));
  void navigator.locks.request(LOCK_NAME, opts, async (lock) => {
    if (!lock) return false;
    const epoch = nextEpoch();
    onChange(createOwnershipState('writable', 'write access granted', epoch));
    await hold;
    if (!stopped) {
      onChange(createOwnershipState('lost', 'write access lost', epoch));
    }
    return true;
  }).then((result) => {
    if (result === undefined && !stopped) {
      onChange(createOwnershipState('read-only', 'another tab owns write access'));
    }
  }).catch(() => {
    if (!stopped) {
      onChange(createOwnershipState('read-only', 'another tab owns write access'));
    }
  });

  const release = () => {
    stopped = true;
    releaseResolve?.();
    if (currentRelease === release) currentRelease = null;
  };
  currentRelease = release;
  return release;
}

export function requestWorkspaceTakeover(onChange: (state: WorkspaceOwnershipState) => void): () => void {
  onChange(createOwnershipState('takeover-requested', 'requesting workspace takeover'));
  return startWorkspaceLease(onChange, true);
}

export function createOwnershipState(status: WorkspaceOwnershipState['status'], message: string | null, epoch = Number(localStorage.getItem(EPOCH_KEY) || '0')): WorkspaceOwnershipState {
  return {
    status,
    tabId: tabId(),
    writerEpoch: epoch,
    message,
  };
}
