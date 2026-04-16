export type MemoryMetadata = {
  project_id?: string;
  capsule_id?: string;
  task_id?: string;
  fact_type?: string;
  source_tool?: string;
  sender_id?: string;
  recipient_scope?: string;
  created_at?: string;
  tags?: string[];
};

export type MemoryQueryFilters = {
  project_id?: string;
  capsule_id?: string;
  task_id?: string;
};

export type RememberFactInput = {
  text: string;
  namespace: string;
  metadata?: MemoryMetadata;
};

export type RememberBatchRequest = {
  facts: RememberFactInput[];
};

export type RememberResponse = {
  id: string;
  blob_id: string;
  owner: string;
  namespace: string;
  metadata: MemoryMetadata;
};

export type RememberBatchResponse = {
  facts: RememberResponse[];
  total: number;
  owner: string;
};

export type RecallRequest = {
  query: string;
  limit?: number;
  namespace: string;
  filters?: MemoryQueryFilters;
};

export type RecallResult = {
  blob_id: string;
  text: string;
  distance: number;
  metadata: Record<string, unknown>;
};

export type RecallResponse = {
  results: RecallResult[];
  total: number;
};

export type HealthResponse = {
  status: string;
  version: string;
};

export type ProjectConfig = {
  projectId: string;
  namespace: string;
  capsuleId?: string;
};

export type ContextFolder = {
  index: string;
  overview: string;
  state: string;
  decisions: string;
  nextSteps: string;
  files: string;
  git: string;
};
