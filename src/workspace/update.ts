import type { WorkspaceUpdateState } from './types';

export type UpdateListener = (state: WorkspaceUpdateState) => void;

export function createUpdateState(status: WorkspaceUpdateState['status'], buildId: string | null, message: string | null): WorkspaceUpdateState {
  return { status, buildId, message };
}

export function setupUpdateListeners(onChange: UpdateListener): (() => void) | undefined {
  if (!('serviceWorker' in navigator)) return undefined;

  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; buildId?: string } | undefined;
    if (!data?.type) return;
    if (data.type === 'UPDATE_READY') {
      onChange({ status: 'waiting-for-idle', buildId: data.buildId ?? null, message: 'A newer build is ready' });
    }
    if (data.type === 'ACTIVATED') {
      onChange({ status: 'current', buildId: data.buildId ?? null, message: null });
    }
  };

  navigator.serviceWorker.addEventListener('message', onMessage);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });

  void navigator.serviceWorker.getRegistration().then((registration) => {
    if (!registration) return;
    const updateFound = () => {
      const worker = registration.waiting ?? registration.installing;
      if (!worker) return;
      const onStateChange = () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          onChange({ status: 'waiting-for-idle', buildId: null, message: 'A newer build is ready' });
        }
      };
      worker.addEventListener('statechange', onStateChange, { once: true });
      onStateChange();
    };
    registration.addEventListener('updatefound', updateFound);
    if (registration.waiting && navigator.serviceWorker.controller) {
      onChange({ status: 'waiting-for-idle', buildId: null, message: 'A newer build is ready' });
    }
  });

  return () => {
    navigator.serviceWorker.removeEventListener('message', onMessage);
  };
}

export async function requestSkipWaiting(buildId: string | null): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const waiting = reg?.waiting;
  if (!waiting) return;
  waiting.postMessage({ type: 'SKIP_WAITING', buildId });
}
