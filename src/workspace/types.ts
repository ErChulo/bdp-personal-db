export const MAX_IMPORT_BYTES = 524_288_000;

export type WorkspaceOwnershipStatus =
  | 'acquiring'
  | 'writable'
  | 'read-only'
  | 'takeover-requested'
  | 'yielding'
  | 'lost';

export type WorkspaceUpdateStatus =
  | 'current'
  | 'waiting-for-idle'
  | 'ready-to-prompt'
  | 'activation-requested'
  | 'reloading'
  | 'failed';

export type WorkspaceOperationKind = 'query' | 'mutation' | 'import' | 'export' | 'backup' | 'restore';

export interface WorkspaceOwnershipState {
  status: WorkspaceOwnershipStatus;
  tabId: string;
  writerEpoch: number;
  message: string | null;
}

export interface WorkspaceUpdateState {
  status: WorkspaceUpdateStatus;
  buildId: string | null;
  message: string | null;
}

export interface WorkspaceOperationState {
  activeCount: number;
  activeKinds: Record<WorkspaceOperationKind, number>;
  lastError: string | null;
}

