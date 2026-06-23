import { describe, expect, it } from 'vitest';
import { beginOperation, createInitialWorkspaceOperationState, endOperation } from '../src/workspace/operations';

describe('workspace operation registry', () => {
  it('tracks overlapping work by kind and returns to idle', () => {
    const initial = createInitialWorkspaceOperationState();
    const importing = beginOperation(initial, 'import');
    const querying = beginOperation(importing, 'query');
    const oneDone = endOperation(querying, 'query');
    const idle = endOperation(oneDone, 'import');

    expect(querying.activeCount).toBe(2);
    expect(querying.activeKinds.import).toBe(1);
    expect(querying.activeKinds.query).toBe(1);
    expect(oneDone.activeCount).toBe(1);
    expect(idle.activeCount).toBe(0);
    expect(idle.activeKinds.import).toBe(0);
    expect(idle.activeKinds.query).toBe(0);
  });

  it('preserves the last operation error for visible recovery state', () => {
    const busy = beginOperation(createInitialWorkspaceOperationState(), 'restore');
    const failed = endOperation(busy, 'restore', 'archive digest mismatch');

    expect(failed.activeCount).toBe(0);
    expect(failed.lastError).toBe('archive digest mismatch');
  });
});
