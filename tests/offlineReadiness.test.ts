import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inspectOfflineReadiness } from '../src/workspace/update';

describe('offline readiness inspection', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'https:' },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('reports ready for file URLs', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'file:' },
    });

    const state = await inspectOfflineReadiness();

    expect(state.status).toBe('ready');
    expect(state.cached).toBe(false);
  });

  it('reports ready when a bdp cache exists and a service worker controls the page', async () => {
    stubServiceWorker({ controlled: true, registration: {} });
    stubCaches(['bdp-test-build']);

    const state = await inspectOfflineReadiness();

    expect(state.status).toBe('ready');
    expect(state.controlled).toBe(true);
    expect(state.cached).toBe(true);
  });

  it('reports installing when cache exists but the page is not controlled yet', async () => {
    stubServiceWorker({ controlled: false, registration: {} });
    stubCaches(['bdp-test-build']);

    const state = await inspectOfflineReadiness();

    expect(state.status).toBe('installing');
    expect(state.cached).toBe(true);
  });
});

function stubServiceWorker(options: { controlled: boolean; registration: object | undefined }) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: options.controlled ? {} : null,
      getRegistration: vi.fn().mockResolvedValue(options.registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      ready: Promise.resolve(),
    },
  });
}

function stubCaches(keys: string[]) {
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: {
      keys: vi.fn().mockResolvedValue(keys),
    },
  });
}
