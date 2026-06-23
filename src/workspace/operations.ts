import type { WorkspaceOperationKind, WorkspaceOperationState } from './types';

export function createInitialWorkspaceOperationState(): WorkspaceOperationState {
  return {
    activeCount: 0,
    activeKinds: {
      query: 0,
      mutation: 0,
      import: 0,
      export: 0,
      backup: 0,
      restore: 0,
    },
    lastError: null,
  };
}

export function beginOperation(state: WorkspaceOperationState, kind: WorkspaceOperationKind): WorkspaceOperationState {
  return {
    ...state,
    activeCount: state.activeCount + 1,
    activeKinds: { ...state.activeKinds, [kind]: state.activeKinds[kind] + 1 },
  };
}

export function endOperation(state: WorkspaceOperationState, kind: WorkspaceOperationKind, error?: string): WorkspaceOperationState {
  return {
    ...state,
    activeCount: Math.max(0, state.activeCount - 1),
    activeKinds: { ...state.activeKinds, [kind]: Math.max(0, state.activeKinds[kind] - 1) },
    lastError: error ?? state.lastError,
  };
}

