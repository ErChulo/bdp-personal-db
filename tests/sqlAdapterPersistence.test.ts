import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  commit: vi.fn(),
}));

vi.mock('../src/adapters/sqlStore', () => ({
  sqlStore: {
    read: store.read,
    write: store.write,
    commit: store.commit,
  },
}));

const messages: Array<Record<string, unknown>> = [];

class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: Record<string, unknown>) {
    messages.push(message);
    const { id, type } = message;
    queueMicrotask(() => {
      if (type === 'export') {
        this.onmessage?.({ data: { id, ok: true, bytes: new Uint8Array([9, 8, 7]) } } as MessageEvent);
      } else if (type === 'schema') {
        this.onmessage?.({ data: { id, ok: true, schema: { tables: [] } } } as MessageEvent);
      } else if (type === 'exec') {
        this.onmessage?.({ data: { id, ok: true, result: { columns: [], rows: [], durationMs: 1 } } } as MessageEvent);
      } else {
        this.onmessage?.({ data: { id, ok: true } } as MessageEvent);
      }
    });
  }
}

vi.stubGlobal('Worker', MockWorker);

import { sqlAdapter } from '../src/adapters/sqlAdapter';

describe('sqlAdapter persistence', () => {
  beforeEach(() => {
    messages.length = 0;
    store.read.mockReset();
    store.write.mockReset();
    store.commit.mockReset();
  });

  it('loads stored SQLite bytes before reading schema in a fresh worker', async () => {
    store.read.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      name: 'practice',
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
      checksum: 'abc',
    });
    store.commit.mockResolvedValue(undefined);

    await sqlAdapter.schema('stored-db');

    expect(messages.map((message) => message.type)).toEqual(['import', 'schema']);
    expect(messages[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('writes changed SQLite bytes back after mutating SQL', async () => {
    const record = {
      bytes: new Uint8Array([1, 2, 3]),
      name: 'practice',
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
      checksum: 'abc',
    };
    store.read.mockResolvedValue(record);
    store.commit.mockResolvedValue(undefined);

    await sqlAdapter.exec('mutable-db', 'CREATE TABLE tasks (id INTEGER PRIMARY KEY);');

    expect(messages.map((message) => message.type)).toEqual(['import', 'exec', 'export']);
    expect(store.commit).toHaveBeenCalledOnce();
  });

  it('reloads previous durable bytes into the worker when persistence fails', async () => {
    const record = {
      bytes: new Uint8Array([4, 5, 6]),
      name: 'rollback',
      createdAt: 1,
      updatedAt: 1,
      revision: 3,
      checksum: 'previous',
    };
    store.read.mockResolvedValue(record);
    store.commit.mockRejectedValue(new Error('commit failed'));

    await expect(sqlAdapter.exec('rollback-db', 'CREATE TABLE lost (id INTEGER);')).rejects.toThrow('commit failed');

    expect(messages.map((message) => message.type)).toEqual(['import', 'exec', 'export', 'import']);
    expect(messages[3].bytes).toEqual(record.bytes);
  });
});
