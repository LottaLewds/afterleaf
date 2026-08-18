import type {
  ContentSeedReport,
  MatchMode,
  SupportedLanguage,
} from "~/content/schema";
import type {LibraryProviderSyncReport} from "~/content/providers/types";

export const LIBRARY_SNAPSHOT_INDEX_VERSION = 1 as const;

export interface LibrarySnapshotDescriptor {
  catalogContentHash: string;
  catalogPath: string;
  createdAt: string;
  directory: string;
  packId: string;
  publicationCount: number;
  snapshotId: string;
}

export interface LibrarySnapshotIndex {
  activeSnapshotId?: string;
  revision: number;
  schemaVersion: typeof LIBRARY_SNAPSHOT_INDEX_VERSION;
  snapshots: LibrarySnapshotDescriptor[];
}

export interface LibraryPublicationDiff {
  addedPublicationIds: string[];
  removedPublicationIds: string[];
  unchangedPublicationIds: string[];
  updatedPublicationIds: string[];
}

export interface LibraryFetchMoreDiff extends LibraryPublicationDiff {
  source: {
    addedCount: number;
    unchangedCount: number;
    updatedCount: number;
  };
}

export interface LibraryFetchMoreRequest {
  blockedTags?: string[];
  languages?: SupportedLanguage[];
  limit?: number;
  match?: MatchMode;
  maxSearchPages?: number;
  providerId?: string;
  query?: string;
  seed?: string;
  localSourceChanged?: boolean;
  tags?: string[];
}

export type LibraryScanRequest = Pick<
  LibraryFetchMoreRequest,
  "languages" | "match" | "seed" | "tags"
> & {
  limit?: number;
  repair?: boolean;
};

export interface LibraryScanResult {
  blacklistedPublicationIds: string[];
  diff: LibraryPublicationDiff;
  finishedAt: string;
  previousSnapshot?: LibrarySnapshotDescriptor;
  requestId: string;
  seedReport: ContentSeedReport;
  snapshot: LibrarySnapshotDescriptor;
  startedAt: string;
}

export interface LibraryFetchMoreResult {
  blacklistedPublicationIds: string[];
  diff: LibraryFetchMoreDiff;
  finishedAt: string;
  previousSnapshot?: LibrarySnapshotDescriptor;
  requestId: string;
  seedReport?: ContentSeedReport;
  snapshot: LibrarySnapshotDescriptor;
  startedAt: string;
  syncReport: LibraryProviderSyncReport;
}

export type LibraryUpdatePhase =
  | "idle"
  | "syncing"
  | "seeding"
  | "activating"
  | "complete"
  | "failed";

interface LibraryUpdateStateBase {
  activeSnapshot?: LibrarySnapshotDescriptor;
  phase: LibraryUpdatePhase;
}

export interface IdleLibraryUpdateState extends LibraryUpdateStateBase {
  phase: "idle";
  status: "idle";
}

export interface RunningLibraryUpdateState extends LibraryUpdateStateBase {
  completedSteps: number;
  message: string;
  phase: "syncing" | "seeding" | "activating";
  requestId: string;
  startedAt: string;
  status: "running";
  totalSteps: 3;
}

export interface SucceededLibraryUpdateState extends LibraryUpdateStateBase {
  phase: "complete";
  result: LibraryFetchMoreResult;
  status: "succeeded";
}

export interface FailedLibraryUpdateState extends LibraryUpdateStateBase {
  completedSteps: number;
  error: {
    message: string;
    name: string;
  };
  failedAt: string;
  failedPhase: "syncing" | "seeding" | "activating";
  phase: "failed";
  requestId: string;
  startedAt: string;
  status: "failed";
  totalSteps: 3;
}

export type LibraryUpdateState =
  | IdleLibraryUpdateState
  | RunningLibraryUpdateState
  | SucceededLibraryUpdateState
  | FailedLibraryUpdateState;

export type LibraryUpdateStateListener = (state: LibraryUpdateState) => void;

export interface LibraryUpdateClient {
  getState(): LibraryUpdateState;
  initialize(): Promise<LibraryUpdateState>;
  scan(request: LibraryScanRequest): Promise<LibraryScanResult>;
  fetchMore(request: LibraryFetchMoreRequest): Promise<LibraryFetchMoreResult>;
  subscribe(listener: LibraryUpdateStateListener): () => void;
}
