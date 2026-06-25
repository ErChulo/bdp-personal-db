import type { OfflineReadinessState, WorkspaceUpdateState } from './types';

export type UpdateListener = (state: WorkspaceUpdateState) => void;
export type OfflineReadinessListener = (state: OfflineReadinessState) => void;

export function createUpdateState(status: WorkspaceUpdateState['status'], buildId: string | null, message: string | null): WorkspaceUpdateState {
  return { status, buildId, message };
}

export async function inspectOfflineReadiness(): Promise<OfflineReadinessState> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (location.protocol === 'file:') {
    return {
      status: 'ready',
      controlled: false,
      cached: false,
      online,
      message: 'Standalone file mode is ready. No service worker is used.',
    };
  }

  if (!('serviceWorker' in navigator)) {
    return {
      status: 'unsupported',
      controlled: false,
      cached: false,
      online,
      message: 'This browser does not support service-worker offline caching.',
    };
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const controlled = Boolean(navigator.serviceWorker.controller);
    const cached = await hasOfflineCache();
    if (!registration) {
      return {
        status: 'online-only',
        controlled,
        cached,
        online,
        message: online ? 'Offline cache is not installed yet. Refresh once after the app loads.' : 'Offline cache is not installed.',
      };
    }
    if (cached && controlled) {
      return {
        status: online ? 'ready' : 'offline',
        controlled,
        cached,
        online,
        message: online ? 'Offline ready. This app can reload without internet in this browser profile.' : 'Running from the offline cache.',
      };
    }
    return {
      status: 'installing',
      controlled,
      cached,
      online,
      message: cached
        ? 'Offline cache is installed. Refresh once to let it control this page.'
        : 'Installing offline cache. Stay online until this changes to offline ready.',
    };
  } catch (error) {
    return {
      status: 'failed',
      controlled: false,
      cached: false,
      online,
      message: (error as Error).message,
    };
  }
}

export function setupOfflineReadinessListeners(onChange: OfflineReadinessListener): () => void {
  if (location.protocol === 'file:') {
    void inspectOfflineReadiness().then(onChange);
    return () => {};
  }

  let stopped = false;
  let timer: number | undefined;

  const refresh = () => {
    void inspectOfflineReadiness().then((state) => {
      if (!stopped) onChange(state);
    });
  };

  const scheduleRefresh = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(refresh, 350);
  };

  refresh();
  timer = window.setInterval(refresh, 5_000);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  navigator.serviceWorker?.addEventListener('controllerchange', scheduleRefresh);
  navigator.serviceWorker?.ready.then(scheduleRefresh).catch(scheduleRefresh);

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
    navigator.serviceWorker?.removeEventListener('controllerchange', scheduleRefresh);
  };
}

export function setupUpdateListeners(onChange: UpdateListener): (() => void) | undefined {
  if (location.protocol === 'file:') return undefined;
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

async function hasOfflineCache(): Promise<boolean> {
  if (!('caches' in window)) return false;
  const keys = await caches.keys();
  return keys.some((key) => key.startsWith('bdp-'));
}
